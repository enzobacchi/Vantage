"use client"

import * as React from "react"
import {
  type ColumnDef,
  type ColumnFiltersState,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { DataTablePagination } from "@/components/ui/data-table-pagination"
import { Skeleton } from "@/components/ui/skeleton"

export interface DataTableRef<TData> {
  clearSelection: () => void
  getSelectedRows: () => TData[]
}

export interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  /** Filter column id for global search (e.g. "display_name" or "email") */
  filterColumnId?: string
  /** Placeholder for filter input */
  filterPlaceholder?: string
  /** Callback when row selection changes. Receives selected row indices. */
  onRowSelectionChange?: (selectedRows: TData[]) => void
  /** Custom empty state message */
  emptyMessage?: string
  /** Custom loading state */
  loading?: boolean
  /** Custom error state */
  error?: string | null
  /** Page size options for pagination */
  pageSizeOptions?: number[]
  /** Callback when a row is clicked (excluding checkbox/links/buttons) */
  onRowClick?: (row: TData) => void
  /** Ref to access clearSelection and getSelectedRows */
  tableRef?: React.RefObject<DataTableRef<TData> | null>
  /** Optional row className based on row data */
  getRowClassName?: (row: TData) => string | undefined
}

export function DataTable<TData, TValue>({
  columns,
  data,
  filterColumnId,
  filterPlaceholder = "Filter…",
  onRowSelectionChange,
  emptyMessage = "No results.",
  loading = false,
  error = null,
  pageSizeOptions = [10, 20, 30, 40, 50],
  onRowClick,
  tableRef,
  getRowClassName,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({})
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({})
  const [filterValue, setFilterValue] = React.useState("")

  const table = useReactTable({
    data,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      columnFilters: filterColumnId
        ? [
            ...columnFilters.filter((f) => f.id !== filterColumnId),
            { id: filterColumnId, value: filterValue },
          ]
        : columnFilters,
      columnVisibility,
      rowSelection,
    },
  })


  React.useEffect(() => {
    if (onRowSelectionChange) {
      const selected = table.getFilteredSelectedRowModel().rows
      onRowSelectionChange(selected.map((r) => r.original))
    }
  }, [rowSelection, table, onRowSelectionChange])

  React.useImperativeHandle(
    tableRef,
    () => ({
      clearSelection: () => setRowSelection({}),
      getSelectedRows: () =>
        table.getFilteredSelectedRowModel().rows.map((r) => r.original),
    }),
    [table]
  )

  return (
    <div className="space-y-4">
      {filterColumnId && (
        <div className="flex items-center py-2">
          <input
            type="search"
            placeholder={filterPlaceholder}
            value={filterValue}
            onChange={(e) => setFilterValue(e.target.value)}
            className="flex h-9 w-full max-w-sm rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
      )}
      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {columns.map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : error ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-sm text-destructive"
                >
                  {error}
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  className={cn(
                    onRowClick && "cursor-pointer",
                    getRowClassName?.(row.original)
                  )}
                  role={onRowClick ? "button" : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  onClick={
                    onRowClick
                      ? () => onRowClick(row.original)
                      : undefined
                  }
                  onKeyDown={
                    onRowClick
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault()
                            onRowClick(row.original)
                          }
                        }
                      : undefined
                  }
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-sm text-muted-foreground"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <DataTablePagination table={table} pageSizeOptions={pageSizeOptions} />
    </div>
  )
}
