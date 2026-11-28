//! Current native request_user_input projection of durable service questions and exact-plan approval.
use base64::Engine as _;
use ironloom_core::{
    ActorId, ConversationId, Counter, OperatorId, PlanId, QuestionId, validation::decode,
};
use ironloom_service::factory::{Command, CommandAction, ConversationSnapshot};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

const PREFIX: &str = "ironloom-prompt.";
const MAX_REPLY: usize = 1024 * 1024;
#[derive(Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
enum Reference {
    Question {
        conversation: ConversationId,
        question: QuestionId,
        revision: Counter,
    },
    Plan {
        conversation: ConversationId,
        plan: PlanId,
        revision: Counter,
        content_hash: ActorId,
    },
}
/// Safe projection failure. No response text, credentials or private source records are formatted.
#[derive(Debug, Eq, PartialEq)]
pub enum PromptError {
    /// Malformed response or unsupported answer shape.
    Invalid,
    /// The referenced question/plan is no longer the current persisted revision.
    Stale,
}
fn id(reference: &Reference) -> Result<String, PromptError> {
    Ok(format!(
        "{PREFIX}{}",
        base64::engine::general_purpose::URL_SAFE_NO_PAD
            .encode(serde_json::to_vec(reference).map_err(|_| PromptError::Invalid)?)
    ))
}
fn reference(id: &str) -> Result<Reference, PromptError> {
    if id.len() > 4096 {
        return Err(PromptError::Invalid);
    }
    let bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(id.strip_prefix(PREFIX).ok_or(PromptError::Invalid)?)
        .map_err(|_| PromptError::Invalid)?;
    serde_json::from_slice(&bytes).map_err(|_| PromptError::Invalid)
}
/// Distinguishes replies to this adapter's durable service prompts from native client requests.
pub fn is_prompt(id: &Value) -> bool {
    id.as_str().is_some_and(|id| id.starts_with(PREFIX))
}
/// Reads only the scope encoded in a native request ID. It conveys no authorization; callers must
/// obtain a fresh authenticated service snapshot before inspecting or acting on the response.
pub fn conversation(id: &str) -> Result<ConversationId, PromptError> {
    Ok(match reference(id)? {
        Reference::Question { conversation, .. } | Reference::Plan { conversation, .. } => {
            conversation
        }
    })
}
/// Renders unresolved questions and an unapproved exact plan without creating separate authority.
/// Request IDs carry immutable service references, not a second pending-approval database.
pub fn requests(state: &ConversationSnapshot) -> Result<Vec<Value>, PromptError> {
    let mut result = Vec::new();
    for question in &state.pending_questions {
        if question.resolved_by.is_some() {
            continue;
        }
        let request = id(&Reference::Question {
            conversation: question.conversation_id.clone(),
            question: question.question_id.clone(),
            revision: question.revision,
        })?;
        let options = if question.choices.is_empty() {
            Value::Null
        } else {
            json!(
                question
                    .choices
                    .iter()
                    .map(|v| json!({"label":v,"description":"Persisted service choice"}))
                    .collect::<Vec<_>>()
            )
        };
        result.push(json!({"id":request,"method":"item/tool/requestUserInput","params":{"threadId":question.conversation_id,"turnId":question.turn_id,"itemId":question.item_id,"isBlocking":true,"questions":[{"id":question.question_id,"header":"Question","question":question.text,"isOther":question.allow_text,"isSecret":false,"options":options}]}}));
    }
    if let Some(plan) = &state.plan
        && state.approval.is_none()
    {
        let turn = state
            .session
            .active_turn_id
            .as_ref()
            .ok_or(PromptError::Stale)?;
        let request = id(&Reference::Plan {
            conversation: state.session.conversation_id.clone(),
            plan: plan.plan_id.clone(),
            revision: plan.revision,
            content_hash: plan.content_hash.clone(),
        })?;
        // The complete currently authorized plan is shown before the one explicit approval choice.
        let plan_text = serde_json::to_string_pretty(plan).map_err(|_| PromptError::Invalid)?;
        result.push(json!({"id":request,"method":"item/tool/requestUserInput","params":{"threadId":state.session.conversation_id,"turnId":turn,"itemId":format!("plan:{}:{}",plan.plan_id.as_str(),plan.revision.get()),"isBlocking":true,"questions":[{"id":"plan","header":"Approve plan","question":format!("Approve this exact plan revision?\n{plan_text}\nUse steering to request changes instead."),"isOther":false,"isSecret":false,"options":[{"label":"Approve","description":"Authorize only the displayed revision and content hash"}]}]}}));
    }
    Ok(result)
}
/// Maps a native answer against a fresh authorized snapshot into the existing validated command
/// action. The service still checks human grants, stored choices and optimistic revision atomically.
pub fn answer(
    state: &ConversationSnapshot,
    operator: &OperatorId,
    id: &str,
    result: &Value,
) -> Result<CommandAction, PromptError> {
    if serde_json::to_vec(result)
        .map_err(|_| PromptError::Invalid)?
        .len()
        > MAX_REPLY
    {
        return Err(PromptError::Invalid);
    }
    let target = reference(id)?;
    let scope = match &target {
        Reference::Question { conversation, .. } | Reference::Plan { conversation, .. } => {
            conversation
        }
    };
    if scope != &state.session.conversation_id {
        return Err(PromptError::Stale);
    }
    let answers = result["answers"]
        .as_object()
        .filter(|v| v.len() == 1)
        .ok_or(PromptError::Invalid)?;
    let action = match target {
        Reference::Question {
            question, revision, ..
        } => {
            let pending = state
                .pending_questions
                .iter()
                .find(|v| {
                    v.question_id == question && v.revision == revision && v.resolved_by.is_none()
                })
                .ok_or(PromptError::Stale)?;
            let values = answers
                .get(question.as_str())
                .and_then(|v| v["answers"].as_array())
                .ok_or(PromptError::Invalid)?;
            let mut choices = Vec::new();
            let mut text = Vec::new();
            for value in values {
                let value = value
                    .as_str()
                    .filter(|v| !v.trim().is_empty())
                    .ok_or(PromptError::Invalid)?;
                if pending.choices.iter().any(|v| v.as_str() == value) {
                    choices.push(value);
                } else {
                    text.push(value);
                }
            }
            if (!pending.allow_multiple && choices.len() > 1)
                || (!pending.allow_text && !text.is_empty())
            {
                return Err(PromptError::Invalid);
            }
            json!({"type":"answer","data":{"question_id":question,"turn_id":pending.turn_id,"item_id":pending.item_id,"choices":choices,"text":if text.is_empty(){None}else{Some(text.join("\n"))},"expected_revision":revision}})
        }
        Reference::Plan {
            plan,
            revision,
            content_hash,
            ..
        } => {
            let current = state
                .plan
                .as_ref()
                .filter(|v| {
                    v.plan_id == plan && v.revision == revision && v.content_hash == content_hash
                })
                .ok_or(PromptError::Stale)?;
            let values = &answers.get("plan").ok_or(PromptError::Invalid)?["answers"];
            if values != &json!(["Approve"]) {
                return Err(PromptError::Invalid);
            }
            json!({"type":"approve","data":{"plan":{"plan_id":current.plan_id,"revision":current.revision,"content_hash":current.content_hash,"approved_by":operator}}})
        }
    };
    let command:Command = decode(&serde_json::to_vec(&json!({"command_id":"native-prompt-validation","project_id":state.session.project_id,"expected_revision":state.revision,"action":action})).map_err(|_|PromptError::Invalid)?).map_err(|_|PromptError::Invalid)?;
    Ok(command.action.clone())
}
