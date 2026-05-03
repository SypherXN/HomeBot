import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { postDiscordOAuthConsume } from "../api";
import { useAuth } from "../auth/AuthContext";

const friendlyErrors: Record<string, string> = {
  no_web_account: "No web account uses this Discord user yet. Create one under New account first.",
  invalid_state: "Sign-in session expired. Try Discord again from the login page.",
  missing_code: "Discord did not return a code. Try again.",
  token_exchange_failed: "Could not complete sign-in with Discord. Check OAuth client settings on the server.",
};

/** Home dashboard (matches sidebar "Home"). */
const homePath = "/";

export default function OAuthCallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { applyWebLogin } = useAuth();
  const [message, setMessage] = useState<string | null>(null);
  const consumeStartedRef = useRef(false);
  const lastConsumeKeyRef = useRef<string>("");

  useEffect(() => {
    const code = params.get("oauth_code");
    const err = params.get("oauth_error");
    const hint = params.get("message");

    if (err) {
      const base = friendlyErrors[err] ?? `Discord sign-in failed (${err}).`;
      setMessage(hint ? `${base} ${decodeURIComponent(hint)}` : base);
      return;
    }

    if (!code) {
      setMessage("Missing OAuth code. Open Sign in and use Continue with Discord again.");
      return;
    }

    const consumeKey = code;
    if (lastConsumeKeyRef.current !== consumeKey) {
      lastConsumeKeyRef.current = consumeKey;
      consumeStartedRef.current = false;
    }

    if (consumeStartedRef.current) {
      return;
    }

    consumeStartedRef.current = true;

    void (async () => {
      try {
        const r = await postDiscordOAuthConsume(code);
        applyWebLogin(r);
        navigate(homePath, { replace: true });
      } catch (e) {
        setMessage(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [params, applyWebLogin, navigate]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-md space-y-4 text-center">
        <h1 className="text-xl font-semibold text-white">Discord sign-in</h1>
        {message ? (
          <>
            <p className="text-sm text-red-300" role="alert">
              {message}
            </p>
            <Link to="/login" className="inline-block text-sm text-blue-400 hover:underline">
              Back to sign in
            </Link>
          </>
        ) : (
          <p className="text-sm text-slate-400">Finishing sign-in…</p>
        )}
      </div>
    </div>
  );
}
