import { FC } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownRendererProps {
  markdown: string;
}

export const MarkdownRenderer: FC<MarkdownRendererProps> = ({
  markdown,
}) => (
  <div className="comin-markdown">
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ children, ...props }) => (
          <a
            {...props}
            target="_blank"
            rel="noopener noreferrer"
          >
            {children}
          </a>
        ),
        table: ({ children, ...props }) => (
          <div style={{ overflowX: "auto", margin: "1.5rem 0" }}>
            <table
              {...props}
              style={{
                width: "100%",
                borderCollapse: "collapse",
                border: "1px solid #cfc7bb",
                borderRadius: "8px",
                overflow: "hidden",
              }}
            >
              {children}
            </table>
          </div>
        ),
        th: ({ children, ...props }) => (
          <th
            {...props}
            style={{
              padding: "0.75rem 1rem",
              textAlign: "left",
              verticalAlign: "top",
              background: "#eee9e1",
              color: "#294c60",
              fontWeight: 700,
              border: "1px solid #d7d0c5",
            }}
          >
            {children}
          </th>
        ),
        td: ({ children, ...props }) => (
          <td
            {...props}
            style={{
              padding: "0.75rem 1rem",
              textAlign: "left",
              verticalAlign: "top",
              border: "1px solid #e2ddd5",
            }}
          >
            {children}
          </td>
        ),
      }}
    >
      {markdown}
    </ReactMarkdown>
  </div>
);
