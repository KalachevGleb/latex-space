import { ChangeEvent, KeyboardEvent, useCallback, useEffect, useRef } from 'react'
import OLFormControl from '@/shared/components/ol/ol-form-control'

type InputProps = {
  onChange: (value: string) => void
  handleAddNewEmail: () => void
}

function Input({ onChange, handleAddNewEmail }: InputProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleEmailChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onChange(event.target.value)
    },
    [onChange]
  )

  const handleKeyDownEvent = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        handleAddNewEmail()
      }
    },
    [handleAddNewEmail]
  )

  return (
    <div className="input-suggestions">
      <OLFormControl
        id="affiliations-email"
        data-testid="affiliations-email"
        className="input-suggestions-main"
        type="email"
        onChange={handleEmailChange}
        onKeyDown={handleKeyDownEvent}
        placeholder="e.g. johndoe@example.com"
        ref={inputRef}
      />
    </div>
  )
}

export default Input

