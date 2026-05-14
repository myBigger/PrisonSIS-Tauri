/**
 * 与 `db.rs` 中 `upgrade_prison_templates_to_guided_if_needed` 的 JSON 保持一致（便于 Web fallback）。
 */
export const GUIDED_SCHEMA_RT01 = `{"version":1,"questions":[{"id":"q_adm_basic","prompt":"一、人员基本情况（依档案据实填写或由其自述）","multiline":true},{"id":"q_adm_rights","prompt":"二、权利义务告知与监规纪律教育要点（申诉、控告途径；遵守监规、服从管理等）","multiline":true},{"id":"q_adm_summary","prompt":"三、谈话要点及服刑人员陈述摘要","multiline":true}],"signaturePlaceholder":"服刑人员（签名）：__________\\n谈话人（签名）：__________\\n记录人（签名）：__________"}`

export const GUIDED_SCHEMA_RT02 = `{"version":1,"questions":[{"id":"q_indiv_topic","prompt":"一、谈话事由与教育主题","multiline":true},{"id":"q_indiv_facts","prompt":"二、事实陈述与民警针对性教育内容摘要","multiline":true},{"id":"q_indiv_attitude","prompt":"三、服刑人员认识态度与表态","multiline":true}],"signaturePlaceholder":"服刑人员（签名）：__________\\n谈话人（签名）：__________\\n记录人（签名）：__________"}`

export const GUIDED_SCHEMA_RT03 = `{"version":1,"questions":[{"id":"q_escort_law","prompt":"一、法律依据与本次提押（出庭）事由说明","multiline":true},{"id":"q_escort_safety","prompt":"二、纪律与安全注意事项告知摘要","multiline":true},{"id":"q_escort_confirm","prompt":"三、服刑人员陈述与确认事项","multiline":true}],"signaturePlaceholder":"服刑人员（签名）：__________\\n谈话人（签名）：__________\\n记录人（签名）：__________"}`

export const GUIDED_SCHEMA_RT04 = `{"version":1,"questions":[{"id":"q_release_rights","prompt":"一、出监前权利义务与安置帮教衔接要点告知摘要","multiline":true},{"id":"q_release_appeals","prompt":"二、服刑人员思想动态与困难诉求摘要","multiline":true},{"id":"q_release_conclusion","prompt":"三、谈话结论与服刑人员表态","multiline":true}],"signaturePlaceholder":"服刑人员（签名）：__________\\n谈话人（签名）：__________\\n记录人（签名）：__________"}`
