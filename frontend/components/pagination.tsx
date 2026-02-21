'use client';

import { Button } from './ui/button';
import { cn } from '../lib/utils';

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
  const canPrev = page > 1;
  const canNext = page < totalPages;

  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="text-sm text-muted-foreground">
        Página {page} de {totalPages || 1}
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" onClick={() => canPrev && onPageChange(page - 1)} disabled={!canPrev}>
          Anterior
        </Button>
        <Button variant="ghost" onClick={() => canNext && onPageChange(page + 1)} disabled={!canNext}>
          Próxima
        </Button>
      </div>
    </div>
  );
}
