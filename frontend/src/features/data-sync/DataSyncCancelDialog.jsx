import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';


export function DataSyncCancelDialog({ open, onOpenChange, onConfirm, pending }) {
  const handleConfirm = async () => {
    await onConfirm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={pending ? undefined : onOpenChange}>
      <DialogContent showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>Batalkan sinkronisasi?</DialogTitle>
          <DialogDescription>
            Proses N8N akan dihentikan. Data yang sudah ditulis sebelum proses
            dihentikan mungkin tetap tersimpan dan tidak otomatis dibatalkan.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={pending}>
              Lanjutkan Sync
            </Button>
          </DialogClose>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={() => void handleConfirm()}
          >
            {pending ? 'Canceling...' : 'Batalkan Sync'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
