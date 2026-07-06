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
      style={{
        width: 56,
        height: 56,
        borderRadius: '50%',
        border: 'none',
        backgroundColor: primaryColor,
        color: '#fff',
        fontSize: 24,
        cursor: 'pointer',
        boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
      }}
    >
      🐞
    </button>
  )
}
