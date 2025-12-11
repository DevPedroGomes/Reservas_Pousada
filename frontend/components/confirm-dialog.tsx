'use client';

import { Button } from './ui/button';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Badge } from './ui/badge';

interface ConfirmDialogProps {
  open: boolean;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ open, message, onCancel, onConfirm }: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 backdrop-blur-sm px-4">
      <div className="w-full max-w-lg">
        <Card className="glass-card">
          <CardHeader className="flex items-start justify-between">
            <div>
              <Badge variant="outline" className="uppercase tracking-[0.14em] text-[10px]">Confirmação</Badge>
              <CardTitle className="mt-2">Deseja continuar?</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-sm text-slate-600">{message}</p>
            <div className="flex items-center justify-end gap-3">
              <Button variant="ghost" onClick={onCancel} aria-label="Cancelar exclusão">
                Cancelar
              </Button>
              <Button onClick={onConfirm} aria-label="Confirmar exclusão">
                Confirmar
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
