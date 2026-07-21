import iconImg from "../../app/icon.png";
import {
  AnimatedForm,
  TechOrbitDisplay,
} from "../../components/ui/animated-login";
import { BoxesLoader } from "../../components/ui/BoxesLoader";
import type {
  DatabaseHealthResponse,
  RuntimeHealthResponse,
} from "../../lib/apiClient";

export function SessionLoadingScreen() {
  return (
    <main className="loginShell">
      <section
        className="loginCard loading"
        style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}
      >
        {/* Solid white, clipped stage: the loader's roll-in masks are white,
            so the translucent loginCard would show seams without this. */}
        <div
          style={{
            width: "100%",
            display: "flex",
            justifyContent: "center",
            background: "#ffffff",
            borderRadius: "16px",
            overflow: "hidden",
            padding: "16px 0 8px",
          }}
        >
          <BoxesLoader />
        </div>
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

// Renderways logo chips orbiting the brand text (the orbit container must be
// given a small fixed size or it fills the panel).
const LogoChip = ({ pad = 6 }: { pad?: number }) => (
  <span
    className="flex items-center justify-center w-full h-full rounded-xl bg-white shadow-lg"
    style={{ padding: pad }}
  >
    <img
      src={iconImg.src}
      alt=""
      style={{ width: "100%", height: "100%", objectFit: "contain" }}
    />
  </span>
);

const ORBITING_ICONS = [
  {
    className: "size-[40px] border-none bg-transparent",
    radius: 100,
    duration: 18,
    component: () => <LogoChip pad={5} />,
  },
  {
    className: "size-[40px] border-none bg-transparent",
    radius: 100,
    duration: 18,
    delay: 9,
    component: () => <LogoChip pad={5} />,
  },
  {
    className: "size-[48px] border-none bg-transparent",
    radius: 175,
    duration: 26,
    reverse: true,
    component: () => <LogoChip />,
  },
  {
    className: "size-[48px] border-none bg-transparent",
    radius: 175,
    duration: 26,
    delay: 13,
    reverse: true,
    component: () => <LogoChip />,
  },
  {
    className: "size-[56px] border-none bg-transparent",
    radius: 250,
    duration: 34,
    component: () => <LogoChip pad={7} />,
  },
  {
    className: "size-[48px] border-none bg-transparent",
    radius: 250,
    duration: 34,
    delay: 17,
    component: () => <LogoChip />,
  },
  {
    className: "size-[48px] border-none bg-transparent",
    radius: 250,
    duration: 34,
    delay: 28,
    component: () => <LogoChip />,
  },
];

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
  return (
    <main className="dark flex h-dvh w-full bg-[#060b18] text-white">
      {/* Left: orbiting brand display (large screens only), like the demo */}
      <div className="hidden lg:flex w-1/2 relative items-center justify-center bg-[#0a1226]">
        <TechOrbitDisplay iconsArray={ORBITING_ICONS} text="RENDERWAYS" />
        <p className="absolute bottom-7 left-0 right-0 text-center text-xs font-semibold text-slate-500">
          © {new Date().getFullYear()} Renderways Technologies Private Limited
        </p>
      </div>

      {/* Right: animated dark form */}
      <div className="w-full lg:w-1/2 h-full flex flex-col justify-center items-center max-lg:px-[10%] bg-[#060b18]">
        <AnimatedForm
          header="Welcome back"
          subHeader="Sign in to your Renderways account"
          fields={[
            {
              label: "Username",
              required: true,
              type: "text",
              placeholder: "Enter your username or email",
              onChange: (event) => onUsernameChange(event.target.value),
            },
            {
              label: "Password",
              required: true,
              type: "password",
              placeholder: "Enter your password",
              onChange: (event) => onPasswordChange(event.target.value),
            },
          ]}
          submitButton="Sign in"
          submittingButton="Signing in..."
          isSubmitting={isBusy}
          errorField={message ?? undefined}
          onSubmit={onSubmit}
        />
      </div>
    </main>
  );
}
