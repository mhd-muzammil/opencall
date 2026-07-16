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

const HERO_FEATURES = [
  {
    label: "Live call records & RTPL tracking",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
      </svg>
    ),
  },
  {
    label: "Engineer productivity, day by day",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M18 20V10M12 20V4M6 20v-6" />
      </svg>
    ),
  },
  {
    label: "Region-wise dashboards & exports",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20 13V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7" />
        <path d="M2 13h20v5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-5Z" />
      </svg>
    ),
  },
] as const;

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

  return (
    <main className="loginShell loginShellPro">
      <div className="loginStage">
        <section className="loginProCard">
          {/* Brand / hero panel */}
          <div className="loginProHero">
            <div className="loginProWordmark">
              <span className="loginProLogo">
                <img src={iconImg.src} alt="Renderways" />
              </span>
              <span className="loginProName">
                RENDER<em>WAYS</em>
              </span>
            </div>

            <div className="loginProHeadline">
              <h1>
                Experience the Future of
                <span> Service Operations</span>
              </h1>
              <p>
                One platform for HP field-service operations — records, RTPL
                movement, productivity and reporting, unified in real time.
              </p>
            </div>

            <ul className="loginProFeatures">
              {HERO_FEATURES.map((feature) => (
                <li key={feature.label}>
                  <span className="loginProFeatureIcon">{feature.icon}</span>
                  {feature.label}
                </li>
              ))}
            </ul>

            <p className="loginProHeroFoot">
              Internal platform of Renderways Technologies Private Limited
            </p>
          </div>

          {/* Form panel */}
          <div className="loginProPanel">
            <div className="loginProPanelHead">
              <p className="loginProEyebrow">Welcome back</p>
              <h2>Login to your workspace</h2>
            </div>

            {message ? <div className="alert">{message}</div> : null}

            <form className="loginForm" onSubmit={onSubmit}>
              <label className="loginProField">
                <span>Username</span>
                <input
                  className="loginInput"
                  type="text"
                  value={username}
                  onChange={(event) => onUsernameChange(event.target.value)}
                  placeholder="Username or email"
                  autoComplete="username"
                  autoFocus
                />
              </label>
              <label className="loginProField">
                <span>Password</span>
                <div className="passwordInputWrap">
                  <input
                    className="loginInput"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => onPasswordChange(event.target.value)}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="passwordToggle"
                    onClick={() => setShowPassword((current) => !current)}
                    title={showPassword ? "Hide password" : "Show password"}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </label>
              <button
                type="submit"
                className="loginSubmit"
                disabled={isBusy || !username.trim() || !password}
              >
                {isBusy ? "SIGNING IN..." : "LOG IN"}
              </button>
            </form>

            <p className="loginHelp">
              Forgot password? Contact your administrator.
            </p>
          </div>
        </section>

        <footer className="loginFooterNote">
          © {new Date().getFullYear()} Renderways Technologies Private Limited · All rights reserved
        </footer>
      </div>
    </main>
  );
}
