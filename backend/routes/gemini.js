import { Router } from 'express';
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

function stripCodeFence(rawText) {
  let text = rawText;
  if (text.startsWith('```html')) {
    text = text.substring(7);
  }
  if (text.startsWith('```')) {
    text = text.substring(3);
  }
  if (text.endsWith('```')) {
    text = text.substring(0, text.length - 3);
  }
  return text.trim();
}

const router = Router();

router.post('/describe-meeting', async (req, res) => {
  try {
    const { minutes } = req.body;
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `You are a professional meeting assistant. Based on the following meeting minutes, provide a concise, high-level description of the meeting. Focus on the main topics discussed, key decisions made, and any action items. Use a professional and clear tone.

Minutes:
${minutes}`,
    });
    res.json({ result: response.text || 'No description generated.' });
  } catch (error) {
    console.error('Error generating meeting description:', error);
    res.json({ result: 'Failed to generate description. Please try again.' });
  }
});

router.post('/extract-meeting-name', async (req, res) => {
  try {
    const { minutes } = req.body;
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Extract a concise and professional title for a meeting based on these minutes. If a title is explicitly mentioned, use it. Otherwise, infer one. Return ONLY the title string.

Minutes:
${minutes}`,
    });
    res.json({ result: response.text?.trim() || 'Untitled Meeting' });
  } catch (error) {
    console.error('Error extracting meeting name:', error);
    res.json({ result: 'Untitled Meeting' });
  }
});

router.post('/find-relevant-meetings', async (req, res) => {
  try {
    const { query, meetings } = req.body;
    const meetingContext = (meetings || []).map((m) => ({
      id: m.id,
      name: m.title || m.name || 'Untitled',
      snippet: (m.rawMinutes || m.minutes || '').substring(0, 500),
    }));

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      config: {
        responseMimeType: 'application/json',
      },
      contents: `You are a meeting search assistant. A user is looking for meetings based on this description: "${query}".

      Here is a list of available meetings (ID, Name, and Snippet):
      ${JSON.stringify(meetingContext)}

      Identify the IDs of the meetings that most closely match the user's description. If multiple meetings are relevant, return all of them in order of relevance. If none are relevant, return an empty array.

      Return the result as a JSON array of strings (the IDs).`,
    });

    const text = response.text || '[]';
    try {
      res.json({ result: JSON.parse(text.trim()) });
    } catch (e) {
      console.error('Failed to parse AI search results:', text);
      res.json({ result: [] });
    }
  } catch (error) {
    console.error('AI Search failed:', error);
    res.json({ result: [] });
  }
});

router.post('/analyze-meeting-minutes', async (req, res) => {
  try {
    const { minutes, metadata } = req.body;
    let promptInput = `Business Unit/Company: ${metadata?.company || 'Not Specified'}
Meeting Category: ${metadata?.category || 'Not Specified'}

Raw Minutes:
${minutes}`;

    if (metadata?.attachments && metadata.attachments.length > 0) {
      promptInput += `\n\nThe following attachments were also part of this meeting. Use their notes as additional context for your analysis:\n`;
      metadata.attachments.forEach((att, idx) => {
        let attStr = `Attachment #${idx + 1}: ${att.fileName} (Type: ${att.fileType})\nGeneral Note: ${att.generalNote || 'None'}\n`;
        if (att.fileType === 'powerpoint' && att.slides && att.slides.length > 0) {
          attStr += `PowerPoint Slides Notes:\n`;
          att.slides.forEach((slide) => {
            attStr += `- Slide ${slide.slideNumber} (${slide.slideLabel || 'Untitled'}): ${slide.note || 'None'}\n`;
          });
        }
        promptInput += attStr + `\n`;
      });
      promptInput += `\nFactor this into your summary, key decisions, and action items. Make sure to generate detailed bullets for 'attachmentInsights'.`;
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      config: {
        systemInstruction:
          "You are a professional meeting analyst. Given raw meeting minutes and any context from meeting attachments, return ONLY a valid JSON object (no markdown, no explanation) with keys: summary (string), keyDecisions (string[]), actionItems (array of {task, owner, dueDate}), sentiment ('positive'|'neutral'|'concerning'), followUpDate (ISO date string or null), and attachmentInsights (array of strings, where each element is a bullet point summarizing what role that specific attachment played based on its notes, or an empty array if there are no attachments). Be concise and factual.",
        responseMimeType: 'application/json',
      },
      contents: promptInput,
    });

    const text = response.text || '{}';
    res.json({ result: JSON.parse(text.trim()) });
  } catch (error) {
    console.error('AI Analysis failed:', error);
    res.status(502).json({ error: 'AI analysis failed' });
  }
});

router.post('/ask-about-meetings', async (req, res) => {
  try {
    const { question, meetings } = req.body;
    const context = (meetings || []).map((m) => ({
      title: m.title || 'Untitled',
      category: m.category,
      date: m.date,
      time: m.time,
      duration: m.duration,
      attendees: m.attendees?.map((a) => `${a.name} (${a.role})`).join(', ') || '',
      aiSummary: m.aiSummary || '',
      keyDecisions: m.keyDecisions || [],
      actionItems: m.actionItems || [],
      sentiment: m.sentiment || 'neutral',
      tags: m.tags || [],
    }));

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      config: {
        systemInstruction:
          'You are a professional meeting analysis assistant. Use the provided list of meetings to answer the user\'s question. Be direct, clear, and refer to specific meetings. Format your response beautifully in Markdown.',
      },
      contents: `User's Question: "${question}"

Meetings Dataset:
${JSON.stringify(context)}`,
    });

    res.json({ result: response.text || "I couldn't process that request." });
  } catch (error) {
    console.error('Failed to answer question about meetings:', error);
    res.status(502).json({ error: 'Failed to answer question about meetings' });
  }
});

router.post('/generate-smart-briefing', async (req, res) => {
  try {
    const { meetingType, previousMeeting } = req.body;
    const prompt = `You are a professional executive assistant. Given these action items and decisions from the previous ${meetingType}, generate a concise 1-page executive briefing in clean HTML. Highlight: (1) completed items in green, (2) items still pending in amber, (3) blocked or overdue items in red. End with a 2-sentence recommended focus for the upcoming meeting. Return only valid HTML with inline styles, no markdown. Use high-contrast colors suited for executives (e.g., solid text colors, nice borders, and readable fonts).

Previous Meeting Details:
Title: ${previousMeeting.title}
Date: ${previousMeeting.date}
Summary: ${previousMeeting.aiSummary || 'None'}
Key Decisions: ${JSON.stringify(previousMeeting.keyDecisions || [])}
Action Items: ${JSON.stringify(previousMeeting.actionItems || [])}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt,
    });

    res.json({ result: stripCodeFence(response.text || '') });
  } catch (error) {
    console.error('Failed to generate smart briefing:', error);
    res.status(502).json({ error: 'Failed to generate smart briefing' });
  }
});

router.post('/ask-corporate-memory', async (req, res) => {
  try {
    const { question, meetings, history } = req.body;
    const systemInstruction = `You are a corporate memory assistant. You have been given a complete record of meeting minutes, decisions, and action items from a manufacturing company. Answer the user's question accurately, citing the exact meeting name, date, and company. If the answer is not in the data, say so clearly. Return answers in clean HTML with bold highlights on key facts. ALWAYS return valid HTML inside your message (using tags like <b>, <i>, <p>, <ul>, <li>, etc.), and no markdown block wrappers.`;

    const meetingsContext = (meetings || []).map((m) => ({
      title: m.title,
      date: m.date,
      time: m.time,
      company: m.company,
      category: m.category,
      aiSummary: m.aiSummary || '',
      keyDecisions: m.keyDecisions || [],
      actionItems: m.actionItems || [],
      rawMinutes: m.rawMinutes || '',
    }));

    const contents = [];
    contents.push({
      role: 'user',
      parts: [{ text: `Here is the complete record of meeting minutes, decisions, and action items of our manufacturing company:\n\n${JSON.stringify(meetingsContext)}\n\nUse this information for the conversation and answer the queries accordingly.` }],
    });
    contents.push({
      role: 'model',
      parts: [{ text: 'Understood. I have loaded and categorized the complete corporate memory of meeting minutes, decisions, and action items. I am ready to answer any questions with high accuracy, citing dates and companies.' }],
    });

    for (const h of history || []) {
      contents.push({
        role: h.role,
        parts: [{ text: h.text }],
      });
    }

    contents.push({
      role: 'user',
      parts: [{ text: question }],
    });

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents,
      config: {
        systemInstruction,
      },
    });

    res.json({ result: stripCodeFence(response.text || 'I was unable to retrieve a response from corporate memory.') });
  } catch (error) {
    console.error('Corporate memory search failure:', error);
    res.status(502).json({ error: 'Corporate memory search failed' });
  }
});

router.post('/generate-email-summary', async (req, res) => {
  try {
    const { meeting } = req.body;
    const prompt = `Generate a professional HTML email summarising this meeting for stakeholders. Include: meeting title, date, company, category, 3-sentence summary, key decisions as a bulleted list, and action items as a table with owner and due date. Use inline CSS only, dark header with white text, clean white body. Do not return any markdown tags, return only valid HTML code.

Meeting Details:
Title: ${meeting.title}
Date: ${meeting.date}
Company: ${meeting.company || 'Company Wide'}
Category: ${meeting.category}
Summary: ${meeting.aiSummary || ''}
Key Decisions: ${JSON.stringify(meeting.keyDecisions || [])}
Action Items: ${JSON.stringify(meeting.actionItems || [])}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt,
    });

    res.json({ result: stripCodeFence(response.text || '') });
  } catch (error) {
    console.error('Failed to generate email summary:', error);
    res.status(502).json({ error: 'Failed to generate email summary' });
  }
});

export default router;
