import type { ReactNode } from "react";

type DataTableProps = {
  headers: string[];
  children: ReactNode;
  empty?: ReactNode;
  isEmpty?: boolean;
};

export function DataTable({ children, empty, headers, isEmpty = false }: DataTableProps) {
  return (
    <div className="data-table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {isEmpty ? (
            <tr>
              <td colSpan={headers.length}>{empty ?? "Nenhum registro encontrado."}</td>
            </tr>
          ) : (
            children
          )}
        </tbody>
      </table>
    </div>
  );
}
