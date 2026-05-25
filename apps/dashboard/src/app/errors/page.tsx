import { createServerSupabase } from "@/lib/supabase";

interface JobError {
  id: string;
  job_type: string;
  message: string;
  created_at: string;
}

export default async function ErrorsPage() {
  const db = createServerSupabase();
  let errors: JobError[] = [];
  if (db) {
    const { data } = await db
      .from("job_errors")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    errors = (data ?? []) as JobError[];
  }

  return (
    <>
      <h1>Error inbox</h1>
      {errors.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>No job errors recorded.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Job</th>
              <th>Message</th>
            </tr>
          </thead>
          <tbody>
            {errors.map((e) => (
              <tr key={e.id}>
                <td>{new Date(e.created_at).toLocaleString()}</td>
                <td>{e.job_type}</td>
                <td>{e.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
