import { Router } from 'express';

// Work email -> which meeting categories they're allowed to see/create. Matched
// (case-insensitively) against Microsoft Graph's `mail` and `userPrincipalName` fields on the
// signed-in account, so it covers people signing in from any of the group's mail domains
// (Packages Limited, Bulleh Shah Packaging, DIC Pakistan), not just packages.com.pk. Kept
// server-side only (never shipped to the client) so it can't be read or tampered with from
// the browser.
const ACCESS_CONTROL = {
  'ali.murtaza@bullehshah.com.pk': { name: 'Syed Ali Murtaza', categories: ['SOR', 'POR', 'MOR'] },
  'arslan.shahid@bullehshah.com.pk': { name: 'Arslan Shahid', categories: ['SOR', 'POR', 'MOR'] },
  'maaz.umlash@bullehshah.com.pk': { name: 'Maaz Umlash', categories: ['SOR', 'POR', 'MOR'] },
  'hafiz.ahmad@bullehshah.com.pk': { name: 'Hafiz Ahmad', categories: ['SOR', 'POR', 'MOR'] },
  'salik.masood@bullehshah.com.pk': { name: 'Salik Masood', categories: ['SOR', 'POR', 'MOR'] },
  'shahraiz.chishty@packages.com.pk': { name: 'Shahraiz Chishty', categories: ['SOR', 'POR', 'MOR'] },
  'muhammad.kashif@bullehshah.com.pk': { name: 'Muhammad Kashif', categories: ['SOR', 'POR'] },
  'syed.kashif@bullehshah.com.pk': { name: 'Syed Kashif', categories: ['SOR', 'POR'] },
  'asif.khan@bullehshah.com.pk': { name: 'Muhammad Asif Khan', categories: ['SOR', 'POR'] },
  'zain.asif@bullehshah.com.pk': { name: 'Zain Asif', categories: ['SOR'] },
  'anum.ali@bullehshah.com.pk': { name: 'Anum Ali', categories: ['SOR'] },
  'talha.umar@bullehshah.com.pk': { name: 'Talha Umar', categories: ['SOR'] },
  'ali.hussain@bullehshah.com.pk': { name: 'Ali Hussain', categories: ['SOR'] },
  'khurram.ali@bullehshah.com.pk': { name: 'Syed Khurram Ali', categories: ['SOR'] },
  'muhammad.asfand@bullehshah.com.pk': { name: 'Muhammad Asfand', categories: ['POR'] },
  'farakh.waheed@bullehshah.com.pk': { name: 'Farakh Waheed', categories: ['POR'] },
  'syed.maisam@bullehshah.com.pk': { name: 'Syed Maisam Naqvi', categories: ['POR'] },
  'bilal.makhdoom@bullehshah.com.pk': { name: 'Bilal Makhdoom', categories: ['POR'] },
  'ahmed.imran@bullehshah.com.pk': { name: 'Ahmed Imran', categories: ['POR'] },
  'hammas.saleem@bullehshah.com.pk': { name: 'Hammas Saleem', categories: ['POR'] },
  'mahnoor.khan@bullehshah.com.pk': { name: 'Mahnoor Khan', categories: ['POR'] },
  'waqas.ilyas@dic.com.pk': { name: 'Waqas Ilyas', categories: ['MOR'] },
};

const router = Router();

router.post('/authorize', async (req, res) => {
  try {
    const { accessToken } = req.body;
    if (!accessToken) {
      return res.status(400).json({ authorized: false, error: 'Missing access token' });
    }

    const graphRes = await fetch(
      'https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!graphRes.ok) {
      console.error('Microsoft Graph lookup failed:', graphRes.status, await graphRes.text());
      return res.status(401).json({ authorized: false, error: 'Could not verify Microsoft account' });
    }

    const profile = await graphRes.json();
    const mail = (profile.mail || '').trim().toLowerCase();
    const upn = (profile.userPrincipalName || '').trim().toLowerCase();
    const entry = ACCESS_CONTROL[mail] || ACCESS_CONTROL[upn];

    if (!entry) {
      console.warn(
        `Access denied — email "${mail || upn || '(none)'}" ` +
        `(${profile.displayName || '(no display name)'}) is not on the roster.`
      );
      return res.status(403).json({ authorized: false, error: 'Not authorized' });
    }

    res.json({ authorized: true, categories: entry.categories, name: entry.name });
  } catch (error) {
    console.error('Authorization check failed:', error);
    res.status(500).json({ authorized: false, error: 'Authorization check failed' });
  }
});

export default router;
