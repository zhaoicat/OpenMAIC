'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  BookOpen,
  HelpCircle,
  Layers3,
  Lightbulb,
  Loader2,
  MessageSquarePlus,
  Save,
  Sparkles,
  Type,
  WandSparkles,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  fetchSceneActions,
  fetchSceneContent,
  generateTTSForScene,
} from '@/lib/hooks/use-scene-generator';
import { useStageStore } from '@/lib/store/stage';
import { useSettingsStore } from '@/lib/store/settings';
import { useAgentRegistry } from '@/lib/orchestration/registry/store';
import type { Scene, SceneEditMetadata } from '@/lib/types/stage';
import type { SceneOutline } from '@/lib/types/generation';
import type { SpeechAction } from '@/lib/types/action';

interface RegenerateSceneDialogProps {
  readonly scene: Scene | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

interface PageEditForm {
  titleDraft: string;
  audienceLevel: string;
  teachingFocus: string;
  exampleStyle: string;
  interactionRequirement: string;
  regenerationNotes: string;
  lockTitle: boolean;
}

interface QuickEditPreset {
  id: string;
  label: string;
  description: string;
  icon: typeof Sparkles;
  updates: Partial<PageEditForm>;
}

const EMPTY_FORM: PageEditForm = {
  titleDraft: '',
  audienceLevel: '',
  teachingFocus: '',
  exampleStyle: '',
  interactionRequirement: '',
  regenerationNotes: '',
  lockTitle: true,
};

const QUICK_EDIT_PRESETS: QuickEditPreset[] = [
  {
    id: 'simpler',
    label: '讲简单',
    description: '降低难度，减少抽象概念',
    icon: BookOpen,
    updates: {
      audienceLevel: '小学阶段，基础一般',
      regenerationNotes: '把这一页讲得更简单，少用抽象术语，步骤更清楚。',
    },
  },
  {
    id: 'examples',
    label: '加例子',
    description: '换成贴近生活的例子',
    icon: Lightbulb,
    updates: {
      exampleStyle: '使用学生熟悉的校园生活、购物或游戏化场景来举例。',
      regenerationNotes: '增加一个具体生活例子，帮助学生把知识点和真实场景联系起来。',
    },
  },
  {
    id: 'interactive',
    label: '加互动',
    description: '加入提问或练习',
    icon: MessageSquarePlus,
    updates: {
      interactionRequirement: '加入一个课堂提问或简短练习，并给出适合老师追问的讲解。',
    },
  },
  {
    id: 'lessText',
    label: '少文字',
    description: '页面更清爽，重点更突出',
    icon: Type,
    updates: {
      regenerationNotes: '减少页面文字，保留关键词和必要图示，讲解内容放到老师口播里。',
    },
  },
  {
    id: 'quiz',
    label: '测一测',
    description: '增加检查理解的问题',
    icon: HelpCircle,
    updates: {
      interactionRequirement: '增加一个能检查学生理解的问题，题目要短，反馈要具体。',
    },
  },
];

function createFormFromScene(scene: Scene | null): PageEditForm {
  if (!scene) return EMPTY_FORM;
  const metadata = scene.editMetadata;
  return {
    titleDraft: metadata?.titleDraft || scene.title,
    audienceLevel: metadata?.audienceLevel || '',
    teachingFocus: metadata?.teachingFocus || '',
    exampleStyle: metadata?.exampleStyle || '',
    interactionRequirement: metadata?.interactionRequirement || '',
    regenerationNotes: metadata?.regenerationNotes || metadata?.sourcePrompt || '',
    lockTitle: metadata?.lockedFields?.title ?? true,
  };
}

function cleanLines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function appendInstruction(current: string, next: string | undefined): string {
  const trimmed = next?.trim();
  if (!trimmed) return current;
  const lines = cleanLines(current);
  if (lines.includes(trimmed)) return current;
  return [...lines, trimmed].join('\n');
}

function compactLine(label: string, value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? `${label}: ${trimmed}` : null;
}

function buildPagePrompt(scene: Scene, form: PageEditForm): string {
  const title = form.titleDraft.trim() || scene.title;
  const sections = [
    `只修改并重生成当前页，不改动其它页面。`,
    `当前页原标题: ${scene.title}`,
    `当前页目标标题: ${title}`,
    `当前页类型: ${scene.type}`,
    compactLine('学生水平/对象', form.audienceLevel),
    compactLine('讲解重点', form.teachingFocus),
    compactLine('例子风格', form.exampleStyle),
    compactLine('练习/互动要求', form.interactionRequirement),
    compactLine('重生成补充要求', form.regenerationNotes),
    form.lockTitle ? `标题必须保持为「${title}」。` : `可以在不偏离教学目标的前提下优化页面标题。`,
    `保持课程整体语言、角色和风格一致，生成适合直接授课播放的当前页内容。`,
  ];
  return sections.filter(Boolean).join('\n');
}

function buildEditMetadata(
  scene: Scene,
  form: PageEditForm,
  sourcePrompt: string,
  generated: boolean,
): SceneEditMetadata {
  const previousVersion = scene.editMetadata?.version || 0;
  const now = Date.now();
  return {
    titleDraft: form.titleDraft.trim() || scene.title,
    audienceLevel: form.audienceLevel.trim(),
    teachingFocus: form.teachingFocus.trim(),
    exampleStyle: form.exampleStyle.trim(),
    interactionRequirement: form.interactionRequirement.trim(),
    regenerationNotes: form.regenerationNotes.trim(),
    sourcePrompt,
    lockedFields: {
      title: form.lockTitle,
    },
    version: previousVersion + 1,
    updatedAt: now,
    lastGeneratedAt: generated ? now : scene.editMetadata?.lastGeneratedAt,
  };
}

function sceneToOutline(scene: Scene, form: PageEditForm): SceneOutline {
  const prompt = buildPagePrompt(scene, form);
  const title = form.titleDraft.trim() || scene.title;
  const keyPoints = [
    ...cleanLines(form.teachingFocus),
    ...cleanLines(form.interactionRequirement),
    ...cleanLines(form.regenerationNotes),
  ];
  return {
    id: scene.id,
    type: scene.type,
    title,
    description: prompt,
    keyPoints: keyPoints.length > 0 ? keyPoints : [title],
    order: scene.order,
    quizConfig:
      scene.type === 'quiz'
        ? { questionCount: 3, difficulty: 'medium', questionTypes: ['single'] }
        : undefined,
  };
}

function fallbackOutlineFromScene(scene: Scene): SceneOutline {
  const title = scene.editMetadata?.titleDraft || scene.title;
  const notes =
    scene.editMetadata?.sourcePrompt ||
    scene.editMetadata?.regenerationNotes ||
    scene.editMetadata?.teachingFocus ||
    title;
  return {
    id: scene.id,
    type: scene.type,
    title,
    description: notes,
    keyPoints: cleanLines(notes).length > 0 ? cleanLines(notes) : [title],
    order: scene.order,
    quizConfig:
      scene.type === 'quiz'
        ? { questionCount: 3, difficulty: 'medium', questionTypes: ['single'] }
        : undefined,
  };
}

async function ensureCanEdit(): Promise<boolean> {
  const meRes = await fetch('/api/auth/me');
  const me = (await meRes.json().catch(() => null)) as {
    permissions?: { canEdit?: boolean };
  } | null;
  return Boolean(me?.permissions?.canEdit);
}

export function RegenerateSceneDialog({ scene, open, onOpenChange }: RegenerateSceneDialogProps) {
  const stage = useStageStore((s) => s.stage);
  const scenes = useStageStore((s) => s.scenes);
  const outlines = useStageStore((s) => s.outlines);
  const updateScene = useStageStore((s) => s.updateScene);
  const selectedAgentIds = useSettingsStore((s) => s.selectedAgentIds);
  const agentsRecord = useAgentRegistry((s) => s.agents);
  const settings = useSettingsStore();
  const [form, setForm] = useState<PageEditForm>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(createFormFromScene(scene));
    }
  }, [open, scene]);

  const agents = useMemo(
    () =>
      selectedAgentIds
        .map((id) => agentsRecord[id])
        .filter(Boolean)
        .map((agent) => ({
          id: agent.id,
          name: agent.name,
          role: agent.role,
          persona: agent.persona,
        })),
    [agentsRecord, selectedAgentIds],
  );

  const updateForm = (updates: Partial<PageEditForm>) => {
    setForm((current) => ({ ...current, ...updates }));
  };

  const applyPreset = (preset: QuickEditPreset) => {
    setForm((current) => ({
      ...current,
      ...preset.updates,
      teachingFocus:
        preset.updates.teachingFocus !== undefined
          ? appendInstruction(current.teachingFocus, preset.updates.teachingFocus)
          : current.teachingFocus,
      exampleStyle:
        preset.updates.exampleStyle !== undefined
          ? appendInstruction(current.exampleStyle, preset.updates.exampleStyle)
          : current.exampleStyle,
      interactionRequirement:
        preset.updates.interactionRequirement !== undefined
          ? appendInstruction(current.interactionRequirement, preset.updates.interactionRequirement)
          : current.interactionRequirement,
      regenerationNotes:
        preset.updates.regenerationNotes !== undefined
          ? appendInstruction(current.regenerationNotes, preset.updates.regenerationNotes)
          : current.regenerationNotes,
    }));
  };

  const saveEditMetadata = async (closeAfterSave: boolean) => {
    if (!scene) return false;
    setIsSaving(true);
    try {
      if (!(await ensureCanEdit())) {
        toast.error('请先登录后再编辑页面');
        return false;
      }
      const sourcePrompt = buildPagePrompt(scene, form);
      updateScene(scene.id, {
        title: form.titleDraft.trim() || scene.title,
        updatedAt: Date.now(),
        editMetadata: buildEditMetadata(scene, form, sourcePrompt, false),
      });
      toast.success('当前页编辑要求已保存');
      if (closeAfterSave) onOpenChange(false);
      return true;
    } finally {
      setIsSaving(false);
    }
  };

  const handleRegenerate = async () => {
    if (!stage || !scene) return;
    if (!(await ensureCanEdit())) {
      toast.error('请先登录后再编辑和重生成页面');
      return;
    }

    const hasInstruction =
      form.titleDraft.trim() ||
      form.audienceLevel.trim() ||
      form.teachingFocus.trim() ||
      form.exampleStyle.trim() ||
      form.interactionRequirement.trim() ||
      form.regenerationNotes.trim();
    if (!hasInstruction) {
      toast.error('请先填写当前页标题或编辑要求');
      return;
    }

    const toastId = toast.loading('正在按编辑要求重生成当前页');
    setIsRegenerating(true);
    try {
      const outline = sceneToOutline(scene, form);
      const allOutlines =
        outlines.length > 0
          ? outlines.map((item) => (item.order === scene.order ? outline : item))
          : scenes.map((item) => (item.id === scene.id ? outline : fallbackOutlineFromScene(item)));
      const sortedScenes = [...scenes].sort((a, b) => a.order - b.order);
      const previousScene = sortedScenes.filter((item) => item.order < scene.order).at(-1);
      const previousSpeeches =
        previousScene?.actions
          ?.filter((action): action is SpeechAction => action.type === 'speech')
          .map((action) => action.text) || [];

      const contentResult = await fetchSceneContent({
        outline,
        allOutlines,
        stageId: stage.id,
        stageInfo: {
          name: stage.name,
          description: stage.description,
          style: stage.style,
        },
        agents,
        languageDirective: stage.languageDirective,
      });
      if (!contentResult.success || !contentResult.content) {
        throw new Error(contentResult.error || '内容生成失败');
      }

      const actionsResult = await fetchSceneActions({
        outline: contentResult.effectiveOutline || outline,
        allOutlines,
        content: contentResult.content,
        stageId: stage.id,
        agents,
        previousSpeeches,
        languageDirective: stage.languageDirective,
      });
      if (!actionsResult.success || !actionsResult.scene) {
        throw new Error(actionsResult.error || '讲解动作生成失败');
      }

      const sourcePrompt = buildPagePrompt(scene, form);
      const nextTitle = form.lockTitle
        ? outline.title
        : actionsResult.scene.title || contentResult.effectiveOutline?.title || outline.title;
      const nextScene: Scene = {
        ...actionsResult.scene,
        id: scene.id,
        order: scene.order,
        stageId: scene.stageId,
        title: nextTitle,
        createdAt: scene.createdAt,
        updatedAt: Date.now(),
        editMetadata: buildEditMetadata(
          { ...scene, editMetadata: scene.editMetadata },
          { ...form, titleDraft: nextTitle },
          sourcePrompt,
          true,
        ),
      };

      if (settings.ttsEnabled && settings.ttsProviderId !== 'browser-native-tts') {
        const ttsResult = await generateTTSForScene(nextScene, stage.languageDirective);
        if (!ttsResult.success) {
          throw new Error(ttsResult.error || '配音生成失败');
        }
      }

      updateScene(scene.id, nextScene);
      toast.success('当前页已按编辑要求重生成', { id: toastId });
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '重生成失败', { id: toastId });
    } finally {
      setIsRegenerating(false);
    }
  };

  const busy = isSaving || isRegenerating;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-hidden p-0">
        <DialogHeader>
          <div className="border-b px-6 py-5">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <WandSparkles className="size-5 text-primary" />
              编辑当前页
            </DialogTitle>
            <DialogDescription className="mt-1">
              选择修改方向，补充要求后保存或重新生成当前页。
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="space-y-5 overflow-y-auto border-r bg-muted/30 p-5">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Layers3 className="size-4 text-primary" />
                当前页
              </div>
              <div className="rounded-lg border bg-background p-4">
                <div className="text-sm font-semibold leading-6">{scene?.title || '当前页'}</div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span className="rounded-full bg-muted px-2 py-1">
                    第 {scene?.order || '-'} 页
                  </span>
                  <span className="rounded-full bg-muted px-2 py-1">{scene?.type || '-'}</span>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Sparkles className="size-4 text-primary" />
                修改方向
              </div>
              <div className="grid gap-2">
                {QUICK_EDIT_PRESETS.map((preset) => {
                  const Icon = preset.icon;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => applyPreset(preset)}
                      disabled={busy}
                      className="group flex min-h-14 w-full items-center gap-3 rounded-lg border bg-background px-3 py-2 text-left transition-colors hover:border-primary/60 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-foreground">
                          {preset.label}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {preset.description}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-lg border bg-background p-4 text-xs text-muted-foreground">
              <div className="font-medium text-foreground">本次会保留</div>
              <div className="mt-2 space-y-1">
                <div>课程其它页面不变</div>
                <div>当前页顺序不变</div>
                <div>{form.lockTitle ? '标题按输入值保留' : '标题允许模型优化'}</div>
              </div>
            </div>
          </aside>

          <div className="min-h-0 overflow-y-auto p-6">
            <div className="grid gap-5">
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="scene-regeneration-notes" className="text-sm font-semibold">
                    直接告诉 AI 怎么改
                  </Label>
                  <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                    <Checkbox
                      checked={form.lockTitle}
                      onCheckedChange={(checked) => updateForm({ lockTitle: checked === true })}
                      disabled={busy}
                    />
                    保留标题
                  </label>
                </div>
                <Textarea
                  id="scene-regeneration-notes"
                  value={form.regenerationNotes}
                  onChange={(event) => updateForm({ regenerationNotes: event.target.value })}
                  placeholder="例如：改得更适合小学三年级，用校园生活例子，页面文字少一点，最后加一个提问。"
                  rows={5}
                  disabled={busy}
                  className="text-base"
                />
              </section>

              <section className="grid gap-4 rounded-lg border bg-muted/20 p-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="scene-page-title">页面标题</Label>
                  <Input
                    id="scene-page-title"
                    value={form.titleDraft}
                    onChange={(event) => updateForm({ titleDraft: event.target.value })}
                    placeholder="输入这一页的标题"
                    disabled={busy}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="scene-audience-level">学生水平/对象</Label>
                  <Input
                    id="scene-audience-level"
                    value={form.audienceLevel}
                    onChange={(event) => updateForm({ audienceLevel: event.target.value })}
                    placeholder="例如：小学三年级、基础较弱"
                    disabled={busy}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="scene-example-style">例子风格</Label>
                  <Input
                    id="scene-example-style"
                    value={form.exampleStyle}
                    onChange={(event) => updateForm({ exampleStyle: event.target.value })}
                    placeholder="例如：校园生活、购物、实验"
                    disabled={busy}
                  />
                </div>
              </section>

              <section className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="scene-teaching-focus">讲解重点</Label>
                  <Textarea
                    id="scene-teaching-focus"
                    value={form.teachingFocus}
                    onChange={(event) => updateForm({ teachingFocus: event.target.value })}
                    placeholder="这一页必须讲清楚哪些知识点，可一行写一个。"
                    rows={5}
                    disabled={busy}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="scene-interaction-requirement">练习/互动要求</Label>
                  <Textarea
                    id="scene-interaction-requirement"
                    value={form.interactionRequirement}
                    onChange={(event) => updateForm({ interactionRequirement: event.target.value })}
                    placeholder="例如：增加一个选择题、一次课堂提问或思考停顿。"
                    rows={5}
                    disabled={busy}
                  />
                </div>
              </section>
            </div>
          </div>
        </div>

        <DialogFooter className="border-t bg-background px-6 py-4 sm:justify-between">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            取消
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => saveEditMetadata(true)} disabled={busy}>
              {isSaving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              保存要求
            </Button>
            <Button onClick={handleRegenerate} disabled={busy}>
              {isRegenerating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <WandSparkles className="size-4" />
              )}
              保存并重生成
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
