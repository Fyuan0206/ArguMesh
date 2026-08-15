interface BrandMarkProps {
  className?: string;
}

export function BrandMark({ className }: BrandMarkProps) {
  return <img className={className} src="/argumesh-mark.svg" alt="" aria-hidden="true" />;
}
