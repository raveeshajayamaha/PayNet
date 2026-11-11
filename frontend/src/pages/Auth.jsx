import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Check } from "lucide-react";
import {
  FormInput,
  LoadingSpinner,
  Logo,
  ConfirmModal,
} from "../components/UI";
import { authService } from "../services/auth";
import { demoMode } from "../services/api";
export default function Auth({ register = false }) {
  const [values, setValues] = useState({
      name: "",
      email: "",
      password: "",
      confirm: "",
      terms: false,
    }),
    [errors, setErrors] = useState({}),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [termsOpen, setTermsOpen] = useState(false);
  const score = [
    values.password.length >= 8,
    /[A-Z]/.test(values.password),
    /[0-9]/.test(values.password),
    /[^a-zA-Z0-9]/.test(values.password),
  ].filter(Boolean).length;
  const bind = (name) => ({
    value: values[name],
    onChange: (e) => setValues({ ...values, [name]: e.target.value }),
    error: errors[name],
  });
  async function submit(e) {
    e.preventDefault();
    const next = {};
    if (register && values.name.trim().length < 2)
      next.name = "Enter your full name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email))
      next.email = "Enter a valid email address.";
    if (values.password.length < 8)
      next.password = "Use at least 8 characters.";
    if (register && values.confirm !== values.password)
      next.confirm = "Passwords must match.";
    if (register && !values.terms) next.terms = "Please accept the demo terms.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    setMessage("");
    try {
      await authService[register ? "register" : "login"](values);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
      setValues((v) => ({ ...v, password: "", confirm: "" }));
    }
  }
  return (
    <div className="auth-content">
      <div className="auth-mobile-logo">
        <Logo />
      </div>
      <span className="eyebrow">
        {register ? "YOUR NEXT CHAPTER STARTS HERE" : "GOOD TO SEE YOU AGAIN"}
      </span>
      <h1>{register ? "Make yourself at home." : "Welcome back."}</h1>
      <p className="muted">
        {register
          ? "Create your PayNet account and get connected."
          : "Your money. Your connections. All in one place."}
      </p>
      <form onSubmit={submit} noValidate>
        {register && (
          <FormInput
            label="Full name"
            id="name"
            autoComplete="name"
            placeholder="Alex Morgan"
            {...bind("name")}
          />
        )}
        <FormInput
          label="Email address"
          id="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          {...bind("email")}
        />
        <FormInput
          label="Password"
          id="password"
          type="password"
          autoComplete={register ? "new-password" : "current-password"}
          placeholder="At least 8 characters"
          {...bind("password")}
        />
        {register && (
          <>
            <div
              className={`strength strength-${score}`}
              aria-label={`Password strength ${score} out of 4`}
            >
              {[1, 2, 3, 4].map((n) => (
                <i key={n} className={score >= n ? "filled" : ""} />
              ))}
            </div>
            <small className="muted">
              {
                [
                  "Use 8+ characters, uppercase, a number and a symbol.",
                  "Weak",
                  "Fair",
                  "Good",
                  "Strong",
                ][score]
              }
            </small>
            <FormInput
              label="Confirm password"
              id="confirm"
              type="password"
              autoComplete="new-password"
              {...bind("confirm")}
            />
          </>
        )}
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={values.terms}
            onChange={(e) => setValues({ ...values, terms: e.target.checked })}
          />
          {register ? (
            <span>
              I agree to the{" "}
              <button
                type="button"
                className="text-button inline"
                onClick={() => setTermsOpen(true)}
              >
                demo terms
              </button>
            </span>
          ) : (
            "Remember me (available with backend authentication)"
          )}
        </label>
        {errors.terms && <p className="error">{errors.terms}</p>}
        {message && (
          <p role="alert" className="notice">
            {message}
          </p>
        )}
        <button className="button full" disabled={busy}>
          {busy ? <LoadingSpinner /> : register ? "Create account" : "Log in"}
          <ArrowUpRight size={18} />
        </button>
      </form>
      <p className="auth-switch">
        {register ? "Already part of PayNet?" : "New around here?"}{" "}
        <Link to={register ? "/login" : "/register"}>
          {register ? "Log in" : "Create an account"}
        </Link>
      </p>
      {demoMode && (
        <Link className="button secondary full" to="/dashboard">
          Explore without an account <ArrowUpRight size={17} />
        </Link>
      )}
      <div className="auth-note">
        <Check size={15} /> University demo · Virtual money only
      </div>
      {termsOpen && (
        <ConfirmModal title="Demo terms" onClose={() => setTermsOpen(false)}>
          <p>
            This university prototype uses fictional users and virtual funds. No
            account is created and no credentials are saved. Please do not enter
            a real banking password. Real authentication and payment processing
            require future backend implementation.
          </p>
        </ConfirmModal>
      )}
    </div>
  );
}

