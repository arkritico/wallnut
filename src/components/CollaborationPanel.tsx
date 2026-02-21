"use client";

import { useState, useEffect } from "react";
import { X, Users, MessageSquare, Clock, UserPlus, Trash2, Check, RotateCcw } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { ProjectRole, ProjectMember, ProjectComment, ProjectHistoryEntry } from "@/lib/collaboration";
import {
  getProjectMembers,
  addProjectMember,
  removeProjectMember,
  updateMemberRole,
  getProjectComments,
  addComment,
  resolveComment,
  getProjectHistory,
  canPerformAction,
} from "@/lib/collaboration";

interface CollaborationPanelProps {
  projectId: string;
  userRole: ProjectRole | null;
  isOpen: boolean;
  onClose: () => void;
}

type Tab = "members" | "comments" | "history";

export default function CollaborationPanel({
  projectId,
  userRole,
  isOpen,
  onClose,
}: CollaborationPanelProps) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<Tab>("comments");

  // Members state
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<ProjectRole>("reviewer");

  // Comments state
  const [comments, setComments] = useState<ProjectComment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [showResolved, setShowResolved] = useState(true);

  // History state
  const [history, setHistory] = useState<ProjectHistoryEntry[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const load = async () => {
      const [m, c, h] = await Promise.all([
        getProjectMembers(projectId),
        getProjectComments(projectId),
        getProjectHistory(projectId),
      ]);
      setMembers(m);
      setComments(c);
      setHistory(h);
    };
    load();
  }, [isOpen, projectId]);

  const handleAddMember = async () => {
    if (!newEmail.trim() || isSubmitting) return;
    setIsSubmitting(true);
    const member = await addProjectMember(projectId, newEmail.trim(), newRole);
    if (member) {
      setMembers((prev) => [...prev, member]);
      setNewEmail("");
    }
    setIsSubmitting(false);
  };

  const handleRemoveMember = async (memberId: string) => {
    await removeProjectMember(memberId);
    setMembers((prev) => prev.filter((m) => m.id !== memberId));
  };

  const handleRoleChange = async (memberId: string, role: ProjectRole) => {
    await updateMemberRole(memberId, role);
    setMembers((prev) =>
      prev.map((m) => (m.id === memberId ? { ...m, role } : m)),
    );
  };

  const handleAddComment = async () => {
    if (!newComment.trim() || isSubmitting) return;
    setIsSubmitting(true);
    const comment = await addComment(projectId, newComment.trim(), "general");
    if (comment) {
      setComments((prev) => [...prev, comment]);
      setNewComment("");
    }
    setIsSubmitting(false);
  };

  const handleResolveComment = async (commentId: string) => {
    await resolveComment(commentId);
    setComments((prev) =>
      prev.map((c) =>
        c.id === commentId ? { ...c, resolved: true } : c,
      ),
    );
  };

  if (!isOpen) return null;

  const filteredComments = showResolved
    ? comments
    : comments.filter((c) => !c.resolved);

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "members", label: t.members, icon: <Users className="w-4 h-4" /> },
    { key: "comments", label: t.comments, icon: <MessageSquare className="w-4 h-4" /> },
    { key: "history", label: t.history, icon: <Clock className="w-4 h-4" /> },
  ];

  const roleBadgeClass: Record<ProjectRole, string> = {
    owner: "bg-purple-100 text-purple-700",
    reviewer: "bg-blue-100 text-blue-700",
    viewer: "bg-gray-100 text-gray-600",
  };

  const roleLabel: Record<ProjectRole, string> = {
    owner: t.roleOwner,
    reviewer: t.roleReviewer,
    viewer: t.roleViewer,
  };

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-white shadow-xl border-l border-gray-200 z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">{t.collaboration}</h2>
        <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "text-accent border-b-2 border-accent"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Members Tab */}
        {activeTab === "members" && (
          <div className="space-y-3">
            {members.map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {member.email || member.userId}
                  </p>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${roleBadgeClass[member.role]}`}>
                    {roleLabel[member.role]}
                  </span>
                </div>
                {canPerformAction(userRole, "manage_members") && member.role !== "owner" && (
                  <div className="flex items-center gap-1">
                    <select
                      value={member.role}
                      onChange={(e) =>
                        handleRoleChange(member.id, e.target.value as ProjectRole)
                      }
                      className="text-xs border border-gray-300 rounded px-1 py-0.5"
                    >
                      <option value="reviewer">{t.roleReviewer}</option>
                      <option value="viewer">{t.roleViewer}</option>
                    </select>
                    <button
                      onClick={() => handleRemoveMember(member.id)}
                      className="p-1 text-red-400 hover:text-red-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))}

            {canPerformAction(userRole, "manage_members") && (
              <div className="mt-4 p-3 border border-dashed border-gray-300 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <UserPlus className="w-4 h-4 text-gray-400" />
                  <span className="text-sm font-medium text-gray-700">{t.addMember}</span>
                </div>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder={t.inviteMemberEmail}
                  className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded mb-2"
                />
                <div className="flex gap-2">
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as ProjectRole)}
                    className="flex-1 text-sm border border-gray-300 rounded px-2 py-1.5"
                  >
                    <option value="reviewer">{t.roleReviewer}</option>
                    <option value="viewer">{t.roleViewer}</option>
                  </select>
                  <button
                    onClick={handleAddMember}
                    disabled={isSubmitting || !newEmail.trim()}
                    className="px-3 py-1.5 text-sm font-medium text-white bg-accent rounded hover:bg-accent/90 disabled:opacity-50"
                  >
                    {t.addMember}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Comments Tab */}
        {activeTab === "comments" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-500">
                {filteredComments.length} {t.comments.toLowerCase()}
              </span>
              <button
                onClick={() => setShowResolved(!showResolved)}
                className="text-xs text-accent hover:underline"
              >
                {showResolved ? t.onlyUnresolved : t.allComments}
              </button>
            </div>

            {filteredComments.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-8">{t.noComments}</p>
            )}

            {filteredComments.map((comment) => (
              <div
                key={comment.id}
                className={`p-3 rounded-lg border ${
                  comment.resolved
                    ? "bg-gray-50 border-gray-200 opacity-60"
                    : "bg-white border-gray-200"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-gray-700">
                        {comment.email || "—"}
                      </span>
                      <span className="text-xs text-gray-400">
                        {new Date(comment.createdAt).toLocaleDateString("pt-PT")}
                      </span>
                      {comment.targetType && comment.targetType !== "general" && (
                        <span className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded">
                          {comment.targetType}
                          {comment.targetId ? `: ${comment.targetId}` : ""}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-800 mt-1">{comment.content}</p>
                  </div>
                  {canPerformAction(userRole, "comment") && !comment.resolved && (
                    <button
                      onClick={() => handleResolveComment(comment.id)}
                      className="p-1 text-green-500 hover:text-green-700"
                      title={t.resolve}
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  )}
                  {comment.resolved && (
                    <span className="text-xs text-green-600 flex items-center gap-0.5">
                      <Check className="w-3 h-3" />
                      {t.resolved}
                    </span>
                  )}
                </div>
              </div>
            ))}

            {canPerformAction(userRole, "comment") && (
              <div className="mt-4 border-t border-gray-200 pt-3">
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder={t.commentPlaceholder}
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded resize-none"
                />
                <button
                  onClick={handleAddComment}
                  disabled={isSubmitting || !newComment.trim()}
                  className="mt-2 w-full px-3 py-1.5 text-sm font-medium text-white bg-accent rounded hover:bg-accent/90 disabled:opacity-50"
                >
                  {t.addComment}
                </button>
              </div>
            )}
          </div>
        )}

        {/* History Tab */}
        {activeTab === "history" && (
          <div className="space-y-2">
            {history.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-8">{t.noHistory}</p>
            )}

            {history.map((entry) => (
              <div key={entry.id} className="flex items-start gap-3 p-2">
                <div className="mt-1">
                  <RotateCcw className="w-3.5 h-3.5 text-gray-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-800">{entry.summary}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-gray-400">
                      {entry.email || "—"}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(entry.createdAt).toLocaleDateString("pt-PT", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
