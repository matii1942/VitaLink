import { useParams } from 'react-router-dom';

/** Next: observations, their scores, and the summary from Sprint 5. */
export function PatientDetail() {
  const { admissionId } = useParams();

  return <p className="state">Admission {admissionId} — not built yet.</p>;
}
