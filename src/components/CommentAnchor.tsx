"use client";

import { useState } from "react";
import { MessageSquare, Send, X } from "lucide-react";
import { addComment } from "@/lib/collaboration";
import { useI18n } from "@/lib/i18n";

interface CommentAnchorProps {
  projectId: string;
  targetType: "finding" | "task" | "article";
  targetId: string;
  commentCount: number;
  onCommentAdded: () => void;
}

export default function CommentAnchor({
  projectId,
  targetType,
  targetId,
  commentCount,
  onCommentAdded,
}: CommentAnchorProps) {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [text, setText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!text.trim() || isSubmitting) return;
    setIsSubmitting(true);
    const result = await addComment(projectId, text.trim(), targetType, targetId);
    if (result) {
      setText("");
      setIsOpen(false);
      onCommentAdded();
    }
    setIsSubmitting(false);
  };

  return (
    <div className="relative inline-flex items-center">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-1 text-gray-400 hover:text-accent transition-colors relative"
        title={t.addComment}
      >
        <MessageSquare className="w-4 h-4" />
        {commentCount > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 text-[10px] font-bold bg-accent text-white rounded-full flex items-center justify-center">
            {commentCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-20 p-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-gray-600">{t.addComment}</span>
            <button onClick={() => setIsOpen(false)} className="p-0.5 hover:bg-gray-100 rounded">
              <X className="w-3 h-3 text-gray-400" />
            </button>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t.commentPlaceholder}
            rows={2}
            className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded resize-none"
            autoFocus
          />
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !text.trim()}
            className="mt-1 w-full flex items-center justify-center gap-1 px-2 py-1 text-xs font-medium text-white bg-accent rounded hover:bg-accent/90 disabled:opacity-50"
          >
            <Send className="w-3 h-3" />
            {t.addComment}
          </button>
        </div>
      )}
    </div>
  );
}
