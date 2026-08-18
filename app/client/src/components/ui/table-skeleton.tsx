import { TableCell, TableRow } from "./table";
import { Skeleton } from "./skeleton";

export interface TableSkeletonProps {
  rows?: number;
  columns?: number;
}

/**
 * TableSkeleton renders skeleton rows directly (no wrapping Table/TableBody).
 * Use it inside an existing <TableBody> to avoid nested <div> inside <tbody>.
 */
export function TableSkeleton({ rows = 5, columns = 5 }: TableSkeletonProps) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <TableRow key={rowIndex}>
          {Array.from({ length: columns }).map((_, colIndex) => (
            <TableCell key={colIndex} className="py-3">
              <Skeleton className="h-4 w-full" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}
