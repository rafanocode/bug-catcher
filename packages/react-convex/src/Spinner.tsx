export function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="bug-catcher-spinner"
      style={{
        display: 'inline-block',
        width: 12,
        height: 12,
        border: '2px solid rgba(255,255,255,0.45)',
        borderTopColor: '#fff',
        borderRadius: '50%',
      }}
    />
  )
}
