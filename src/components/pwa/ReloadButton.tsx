'use client';

export function ReloadButton({ label }: { label: string }) {
  return (
    <button type="button" className="primary-button" onClick={() => window.location.reload()}>
      {label}
    </button>
  );
}
