export default function LoginPage() {
  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui", maxWidth: 420 }}>
      <h1>Dan login</h1>
      <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
        Review approve/reject will require an authenticated Dan session once Supabase
        Auth is enabled. Until then, local/dev uses the service-role key.
      </p>
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
            style={{ display: "block", width: "100%", marginTop: "0.25rem" }}
          />
        </label>
        <button type="submit" className="btn">
          Send magic link
        </button>
      </form>
      <p style={{ marginTop: "1rem", fontSize: "0.85rem" }}>
        <a href="/review">Back to Review</a>
      </p>
    </main>
  );
}
