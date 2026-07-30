import { Loader2, Sparkles, AlertCircle } from 'lucide-react';

interface LoginProps {
  onSignIn: () => void;
  isSigningIn: boolean;
  error: string | null;
}

function MicrosoftLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

export default function Login({ onSignIn, isSigningIn, error }: LoginProps) {
  return (
    <div className="min-h-screen bg-[#0f1117] text-[#f3f4f6] font-sans flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-[#1a1d27] border border-gray-800 rounded-2xl p-8 shadow-2xl">
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-[#6c63ff] flex items-center justify-center text-white shadow-lg shadow-[#6c63ff]/30 mb-4">
            <Sparkles className="w-6 h-6" />
          </div>
          <h1 className="font-extrabold text-white text-xl tracking-tight">MinuteMind AI</h1>
          <p className="text-xs text-gray-500 font-semibold uppercase tracking-widest mt-1">Meeting Organizer</p>
        </div>

        <button
          onClick={onSignIn}
          disabled={isSigningIn}
          className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-100 disabled:opacity-60 text-gray-900 px-4 py-3 rounded-xl text-sm font-semibold transition-all active:scale-95"
        >
          {isSigningIn ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <MicrosoftLogo />
          )}
          <span>{isSigningIn ? 'Signing in…' : 'Sign in with Microsoft'}</span>
        </button>

        {error && (
          <div className="mt-4 flex items-start gap-2 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs rounded-xl p-3">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <p className="text-[10px] text-gray-600 text-center mt-6 leading-relaxed">
          Access is restricted to Packages Limited company accounts.
        </p>
      </div>
    </div>
  );
}
