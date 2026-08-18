import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { CheckCircle2, XCircle, Trash2 } from 'lucide-react';
import { useState } from 'react';

interface BulkActionsProps {
  selectedCount: number;
  onActivate?: () => void;
  onDeactivate?: () => void;
  onDelete?: () => void;
  isLoading?: boolean;
  entityName?: string; // "vouchers", "users", "NAS devices"
}

export function BulkActions({
  selectedCount,
  onActivate,
  onDeactivate,
  onDelete,
  isLoading,
  entityName = 'items',
}: BulkActionsProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showActivateDialog, setShowActivateDialog] = useState(false);
  const [showDeactivateDialog, setShowDeactivateDialog] = useState(false);

  if (selectedCount === 0) {
    return null;
  }

  const handleActivate = () => {
    setShowActivateDialog(false);
    onActivate?.();
  };

  const handleDeactivate = () => {
    setShowDeactivateDialog(false);
    onDeactivate?.();
  };

  const handleDelete = () => {
    setShowDeleteDialog(false);
    onDelete?.();
  };

  return (
    <>
      <div className="flex items-center gap-2 p-4 bg-muted/50 rounded-lg border">
        <span className="text-sm font-medium">
          {selectedCount} {entityName} selected
        </span>
        <div className="flex gap-2 mr-auto">
          {onActivate && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowActivateDialog(true)}
              disabled={isLoading}
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Activate
            </Button>
          )}
          {onDeactivate && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowDeactivateDialog(true)}
              disabled={isLoading}
            >
              <XCircle className="h-4 w-4 mr-2" />
              Deactivate
            </Button>
          )}
          {onDelete && (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setShowDeleteDialog(true)}
              disabled={isLoading}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
          )}
        </div>
      </div>

      {/* Activate Confirmation */}
      <AlertDialog open={showActivateDialog} onOpenChange={setShowActivateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Activate {selectedCount} {entityName}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will activate {selectedCount} selected {entityName}. They will become active immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleActivate}>
              Activate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Deactivate Confirmation */}
      <AlertDialog open={showDeactivateDialog} onOpenChange={setShowDeactivateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate {selectedCount} {entityName}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will deactivate {selectedCount} selected {entityName}. They will no longer be active.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeactivate}>
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedCount} {entityName}?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>This action cannot be undone. This will permanently delete:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>{selectedCount} {entityName}</li>
                <li>All associated data and history</li>
              </ul>
              <p className="font-semibold text-destructive mt-2">
                Are you absolutely sure?
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
