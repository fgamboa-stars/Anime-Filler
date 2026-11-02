import { Link2 } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { copyText } from '@/hooks/useClipboard';

export function ShareButton({ variant = 'secondary', size = 'sm', ...props }: Omit<ButtonProps, 'onClick'>) {
  const toast = useToast();
  return (
    <Button
      variant={variant}
      size={size}
      onClick={async () => {
        const ok = await copyText(window.location.href);
        toast.show(ok ? 'Link copied' : 'Couldn’t copy — copy the address bar instead', ok ? 'success' : 'error');
      }}
      {...props}
    >
      <Link2 aria-hidden />
      Share current view
    </Button>
  );
}
