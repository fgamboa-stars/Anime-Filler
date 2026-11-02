import { CircleCheck, Hourglass } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export function FillerAvailabilityBadge({ available, className }: { available: boolean; className?: string }) {
  return available ? (
    <Badge variant="canon" className={className}>
      <CircleCheck aria-hidden />
      Filler data available
    </Badge>
  ) : (
    <Badge variant="default" className={className}>
      <Hourglass aria-hidden />
      Filler data coming soon
    </Badge>
  );
}
