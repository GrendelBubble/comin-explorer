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
          <div style={{ overflowX: "auto" }}>
            <table
              {...props}
              className="table table-bordered"
            >
              {children}
            </table>
          </div>
        ),
      }}
    >
      {markdown}
    </ReactMarkdown>
  </div>
);
