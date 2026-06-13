#![forbid(unsafe_code)]

use std::collections::BTreeSet;

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Process graph validation error.
#[derive(Debug, Error, Eq, PartialEq)]
pub enum GraphError {
    /// A graph had no nodes.
    #[error("process graph must contain at least one node")]
    EmptyGraph,
    /// A transition referenced a missing source or target node.
    #[error("transition references unknown node {node}")]
    UnknownNode { node: String },
    /// A transition used an unbounded retry policy.
    #[error("transition from {from_node} to {target_node} uses unbounded retry")]
    UnboundedRetry {
        from_node: String,
        target_node: String,
    },
}

/// Process graph validation result.
pub type GraphResult<T> = Result<T, GraphError>;

/// A typed unit of work in the supervisor process graph.
#[derive(Clone, Debug, Eq, JsonSchema, PartialEq, Deserialize, Serialize)]
pub struct ProcessNode {
    name: String,
    required_inputs: Vec<String>,
}

impl ProcessNode {
    /// Creates a process node with the required input names.
    pub fn new<I, S>(name: impl Into<String>, required_inputs: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        Self {
            name: name.into(),
            required_inputs: required_inputs.into_iter().map(Into::into).collect(),
        }
    }

    /// Returns the stable process node name.
    #[must_use]
    pub fn name(&self) -> &str {
        &self.name
    }
}

/// Retry budget for a process graph transition.
#[derive(Clone, Debug, Eq, JsonSchema, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "snake_case", tag = "kind")]
pub enum RetryPolicy {
    /// Retry a bounded number of times.
    Bounded { max_attempts: u8 },
    /// Invalid first-release policy used only to verify fail-closed validation.
    Unbounded,
}

impl RetryPolicy {
    /// Creates a bounded retry policy.
    #[must_use]
    pub fn bounded(max_attempts: u8) -> Self {
        Self::Bounded { max_attempts }
    }

    /// Creates an unbounded retry policy that graph validation must reject.
    #[must_use]
    pub fn unbounded() -> Self {
        Self::Unbounded
    }
}

/// Directed edge between process graph nodes.
#[derive(Clone, Debug, Eq, JsonSchema, PartialEq, Deserialize, Serialize)]
pub struct Transition {
    source: String,
    target: String,
    retry_policy: RetryPolicy,
}

impl Transition {
    /// Creates a graph transition.
    pub fn new(
        source: impl Into<String>,
        target: impl Into<String>,
        retry_policy: RetryPolicy,
    ) -> Self {
        Self {
            source: source.into(),
            target: target.into(),
            retry_policy,
        }
    }
}

/// Supervisor process graph.
#[derive(Clone, Debug, Eq, JsonSchema, PartialEq, Deserialize, Serialize)]
pub struct ProcessGraph {
    nodes: Vec<ProcessNode>,
    transitions: Vec<Transition>,
}

impl ProcessGraph {
    /// Creates a process graph from nodes and transitions.
    #[must_use]
    pub fn new(nodes: Vec<ProcessNode>, transitions: Vec<Transition>) -> Self {
        Self { nodes, transitions }
    }

    /// Validates node references and retry bounds.
    pub fn validate(&self) -> GraphResult<()> {
        if self.nodes.is_empty() {
            return Err(GraphError::EmptyGraph);
        }
        let node_names = self
            .nodes
            .iter()
            .map(|node| node.name.as_str())
            .collect::<BTreeSet<_>>();
        for transition in &self.transitions {
            if !node_names.contains(transition.source.as_str()) {
                return Err(GraphError::UnknownNode {
                    node: transition.source.clone(),
                });
            }
            if !node_names.contains(transition.target.as_str()) {
                return Err(GraphError::UnknownNode {
                    node: transition.target.clone(),
                });
            }
            if matches!(transition.retry_policy, RetryPolicy::Unbounded) {
                return Err(GraphError::UnboundedRetry {
                    from_node: transition.source.clone(),
                    target_node: transition.target.clone(),
                });
            }
        }
        Ok(())
    }

    /// Returns the first target node for the supplied source node.
    #[must_use]
    pub fn next_node(&self, source: &str) -> Option<&ProcessNode> {
        let target = self
            .transitions
            .iter()
            .find(|transition| transition.source == source)
            .map(|transition| transition.target.as_str())?;
        self.nodes.iter().find(|node| node.name == target)
    }
}

/// Builds the first-release graph that routes Discord commands to the gate worker.
#[must_use]
pub fn default_gate_graph() -> ProcessGraph {
    ProcessGraph::new(
        vec![
            ProcessNode::new(
                "discord_command_received",
                vec!["thread_id", "actor_id", "work_item_id"],
            ),
            ProcessNode::new("run_gate_worker", vec!["thread_id", "work_item_id"]),
        ],
        vec![Transition::new(
            "discord_command_received",
            "run_gate_worker",
            RetryPolicy::bounded(1),
        )],
    )
}
