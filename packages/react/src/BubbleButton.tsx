export interface BubbleButtonProps {
  primaryColor: string
  onClick: () => void
}

export function BubbleButton({ primaryColor, onClick }: BubbleButtonProps) {
  return (
    <button
      type="button"
      aria-label="Report a bug"
      onClick={onClick}
      className="bug-catcher-bubble-btn"
      style={{
        width: 56,
        height: 56,
        borderRadius: '50%',
        border: 'none',
        backgroundColor: primaryColor,
        color: '#fff',
        fontSize: 24,
        lineHeight: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        boxShadow: '0 4px 14px rgba(0,0,0,0.25), 0 1px 3px rgba(0,0,0,0.15)',
      }}
    >
      🐞
    </button>
  )
}
