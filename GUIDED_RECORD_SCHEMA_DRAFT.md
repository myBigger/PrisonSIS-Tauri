# 引导式笔录 Schema 示例（草案）

> 用途：用于业务确认「问答式录入」首版字段、题型与正文合成规则。  
> 说明：该草案对应 `guided` 模板；现有 `free_text` 模板继续保留。

## 1) 模板元数据建议

```json
{
  "template_type": "guided",
  "schema_version": "1.0.0",
  "name": "个别教育谈话（引导式）",
  "category": "RT-02",
  "guide_schema_json": {}
}
```

## 2) `guide_schema_json` 示例（MVP）

```json
{
  "version": "1.0.0",
  "title": "个别教育谈话",
  "steps": [
    {
      "id": "basic_info",
      "title": "基础信息",
      "fields": [
        { "id": "talk_date", "label": "谈话日期", "type": "date", "required": true },
        { "id": "talk_location", "label": "谈话地点", "type": "text", "required": true, "max_length": 50 },
        { "id": "interrogator", "label": "谈话人", "type": "text", "required": true, "max_length": 20 },
        { "id": "recorder", "label": "记录人", "type": "text", "required": true, "max_length": 20 }
      ]
    },
    {
      "id": "topic",
      "title": "谈话主题",
      "fields": [
        {
          "id": "topic_type",
          "label": "主题类型",
          "type": "single_select",
          "required": true,
          "options": [
            { "value": "discipline", "label": "纪律教育" },
            { "value": "emotion", "label": "情绪疏导" },
            { "value": "safety", "label": "安全提醒" }
          ]
        },
        { "id": "topic_detail", "label": "主题说明", "type": "textarea", "required": true, "max_length": 400 }
      ]
    },
    {
      "id": "result",
      "title": "结果记录",
      "fields": [
        { "id": "criminal_response", "label": "服刑人员回应", "type": "textarea", "required": true, "max_length": 500 },
        { "id": "followup_plan", "label": "后续措施", "type": "textarea", "required": false, "max_length": 300 },
        { "id": "manual_appendix", "label": "补充说明", "type": "textarea", "required": false, "max_length": 800 }
      ]
    }
  ],
  "compose": {
    "strategy": "template_string",
    "template": "谈话时间：{{talk_date}}\n谈话地点：{{talk_location}}\n谈话人：{{interrogator}}\n记录人：{{recorder}}\n\n主题类型：{{topic_type}}\n主题说明：{{topic_detail}}\n\n服刑人员回应：{{criminal_response}}\n后续措施：{{followup_plan}}\n\n补充说明：{{manual_appendix}}"
  }
}
```

## 3) 落库与审批规则（MVP）

- `records.content`：始终保存合成后的可读正文，作为审批、导出、打印的统一正文来源。  
- `records.guide_answers_json`（新增建议字段）：保存问答原始答案快照，便于复核与统计。  
- 提交审批后，正文与问答快照一起锁定；驳回后回草稿允许重填并重新合成。

## 4) MVP 排期建议（两迭代）

- 迭代 A（约 1 周）：schema 与存储字段落地、模板管理支持 `guided` 类型、新建笔录支持线性向导录入。  
- 迭代 B（约 1 周）：正文合成稳定性、驳回重填流程、验收与培训材料。  

## 5) 非目标（本期不做）

- 条件分支/跳题逻辑。  
- 语音输入与朗读（TTS）。  
- OCR/图片转文字自动填充。  
