export interface NoteTemplateVariables {
  title: string;
  content: string;
  url?: string | null;
  generatedAt: string;
  mode: string;
  template: string;
  model: string;
}

export const NOTE_TEMPLATE_PRESETS = [
  {
    id: 'default',
    name: '默认笔记',
    content: '{{content}}',
  },
  {
    id: 'project-review',
    name: '项目复盘',
    content: [
      '# {{title}}',
      '',
      '> 来源：{{url}}',
      '> 生成：{{generatedAt}} · {{mode}} · {{template}} · {{model}}',
      '',
      '## 我的结论',
      '',
      '- ',
      '',
      '## 原始笔记',
      '',
      '{{content}}',
    ].join('\n'),
  },
  {
    id: 'task-list',
    name: '任务清单',
    content: [
      '# {{title}}',
      '',
      '## 待办',
      '',
      '- [ ] ',
      '',
      '## 视频笔记',
      '',
      '{{content}}',
    ].join('\n'),
  },
] as const;

export function applyNoteTemplate(templateText: string | null | undefined, variables: NoteTemplateVariables): string {
  const template = String(templateText || '').trim();
  if (!template) return variables.content;
  const replacements: Record<string, string> = {
    title: variables.title,
    content: variables.content,
    url: variables.url || '',
    generatedAt: variables.generatedAt,
    mode: variables.mode,
    template: variables.template,
    model: variables.model,
  };
  return template.replace(/\{\{\s*(title|content|url|generatedAt|mode|template|model)\s*\}\}/g, (_, key: string) => replacements[key] || '');
}
