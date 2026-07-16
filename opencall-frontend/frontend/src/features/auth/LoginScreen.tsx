import { useState } from "react";
import iconImg from "../../app/icon.png";
import type {
  DatabaseHealthResponse,
  RuntimeHealthResponse,
} from "../../lib/apiClient";

export function SessionLoadingScreen() {
  return (
    <main className="loginShell">
      <section className="loginCard loading">
        <div className="brandBlock">
          <div className="brandMark" aria-hidden="true">
            <img
              src={iconImg.src}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: "inherit" }}
            />
          </div>
          <div>
            <p className="eyebrow">Renderways</p>
            <h1>Loading workspace</h1>
          </div>
        </div>
      </section>
    </main>
  );
}

export function LoginScreen({
  username,
  password,
  isBusy,
  message,
  onUsernameChange,
  onPasswordChange,
  onSubmit,
}: Readonly<{
  username: string;
  password: string;
  isBusy: boolean;
  message: string | null;
  dbHealth: DatabaseHealthResponse | null;
  runtimeHealth: RuntimeHealthResponse | null;
  onUsernameChange: (username: string) => void;
  onPasswordChange: (password: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}>) {
  const [showPassword, setShowPassword] = useState(false);
  const [helpNote, setHelpNote] = useState<string | null>(null);

  return (
    <main className="fezShell">
      {/* Top-right of the page, outside the panel — as in the reference. */}
      <div className="fezLang" aria-label="Language">
        <span className="fezLangFlag">IN</span>
        English
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>

      <section className="fezPanel">
        {/* White brand bar across the top of the gray panel */}
        <header className="fezBrandBar">
          <img src={iconImg.src} alt="" />
          <span className="fezWordmark">
            RENDER<em>WAYS</em>
          </span>
        </header>

        <div className="fezBody">
          <div className="fezHero">
            <h1>
              Experience the Future of
              <span>Enterprise Productivity</span>
            </h1>
            <p>
              An AI-powered enterprise platform for service, workforce, sales,
              and support operations — unified through automation and
              real-time intelligence.
            </p>
          </div>

          {/* Raised white login card overhanging the gray panel */}
          <div className="fezLoginCard">
            <h2>Login</h2>

            {message ? <div className="alert">{message}</div> : null}
            {helpNote ? <div className="fezHelpNote">{helpNote}</div> : null}

            <form className="fezForm" onSubmit={onSubmit}>
              <input
                className="fezInput"
                type="text"
                value={username}
                onChange={(event) => onUsernameChange(event.target.value)}
                placeholder="Username or email"
                aria-label="Username"
                autoComplete="username"
                autoFocus
              />
              <div className="fezPasswordWrap">
                <input
                  className="fezInput"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => onPasswordChange(event.target.value)}
                  placeholder="Password"
                  aria-label="Password"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="fezEye"
                  onClick={() => setShowPassword((current) => !current)}
                  title={showPassword ? "Hide password" : "Show password"}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  ) : (
                    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  )}
                </button>
              </div>
              <button
                type="submit"
                className="fezSubmit"
                disabled={isBusy || !username.trim() || !password}
              >
                {isBusy ? "SIGNING IN..." : "LOG IN"}
              </button>
            </form>

            <div className="fezLinks">
              <button
                type="button"
                className="fezLink"
                onClick={() =>
                  setHelpNote("Password resets are handled by your administrator.")
                }
              >
                Forgot Password?
              </button>
              <button
                type="button"
                className="fezLink"
                onClick={() =>
                  setHelpNote(
                    "Internal platform of Renderways Technologies Private Limited.",
                  )
                }
              >
                Privacy Policy
              </button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
