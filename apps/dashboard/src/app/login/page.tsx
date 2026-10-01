const errors: Record<string, string> = {
  invalid_email: "Enter a valid email address.",
  invalid_link: "That link is invalid, expired, or already used. Request a new link below.",
  unavailable: "Sign-in is unavailable. The studio administrator needs to check the authentication configuration or service.",
  logout_incomplete: "You are signed out of this browser. The authentication service could not confirm remote sign-out; try again when it is available.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const error = typeof params.error === "string" && Object.hasOwn(errors, params.error)
    ? errors[params.error]
    : undefined;
  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui", maxWidth: 420 }}>
      <h1>Review login</h1>
      <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
        Use the email address provisioned for this studio. This form does not create an account.
      </p>
      {error && <p role="alert">{error}</p>}
      {params.sent === "1" && <p role="status">If your account is eligible, a sign-in link is on its way. Check your inbox.</p>}
      {params.signed_out === "1" && <p role="status">You are signed out of this browser.</p>}
      <form
        action="/api/auth/magic-link"
        method="post"
        style={{ marginTop: "1.5rem" }}
      >
        <label style={{ display: "block", marginBottom: "0.5rem" }}>
          Email
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            style={{ display: "block", width: "100%", marginTop: "0.25rem" }}
          />
        </label>
        <button type="submit" className="btn">
          Send magic link
        </button>
      </form>
      <form action="/api/auth/logout" method="post" style={{ marginTop: "1rem" }}>
        <button type="submit" className="btn">Sign out of this browser</button>
      </form>
      <p style={{ marginTop: "1rem", fontSize: "0.85rem" }}>
        <a href="/review">Back to Review</a>
      </p>
    </main>
  );
}
