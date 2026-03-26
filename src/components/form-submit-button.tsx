"use client";

import { type ButtonHTMLAttributes } from "react";
import { useFormStatus } from "react-dom";

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> & {
  pendingText?: string;
};

export function FormSubmitButton({
  children,
  disabled,
  pendingText = "处理中...",
  ...rest
}: Props) {
  const { pending } = useFormStatus();
  const isDisabled = Boolean(disabled) || pending;

  return (
    <button type="submit" disabled={isDisabled} {...rest}>
      {pending ? pendingText : children}
    </button>
  );
}
