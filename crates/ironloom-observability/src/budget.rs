//! Pure human budget edits. Accounting belongs to durable usage/reservation operations.
use crate::factory::{Budget, BudgetData};
use ironloom_core::{Counter, validation::ValidationErrors};

/// Rejected budget edit without any monetary or secret values in its diagnostics.
#[derive(Debug, Eq, PartialEq)]
pub enum BudgetError {
    /// Another edit/accounting revision won, or revision space is exhausted.
    Conflict,
    /// The caller attempted to edit service-owned accounting or convert outstanding exposure.
    Invalid(ValidationErrors),
}
/// Edits optional limits independently from plan approval. Lowering below exposure is allowed;
/// subsequent admission must enforce the new limit. Unknown usage is never silently zeroed.
pub fn edit(previous: Option<&Budget>, requested: &Budget) -> Result<Budget, BudgetError> {
    let current = previous.map(|budget| budget.revision.get()).unwrap_or(1);
    if requested.revision.get() != current {
        return Err(BudgetError::Conflict);
    }
    let incurred = previous
        .map(|budget| budget.incurred_micros)
        .unwrap_or(Counter::new(0));
    let reserved = previous
        .map(|budget| budget.reserved_micros)
        .unwrap_or(Counter::new(0));
    let uncertain = previous.is_some_and(|budget| budget.uncertain_usage);
    for (field, changed) in [
        ("incurred_micros", requested.incurred_micros != incurred),
        ("reserved_micros", requested.reserved_micros != reserved),
        ("uncertain_usage", requested.uncertain_usage != uncertain),
    ] {
        if changed {
            return Err(BudgetError::Invalid(ValidationErrors::field(
                field,
                "accounting_read_only",
            )));
        }
    }
    if previous.is_some_and(|budget| budget.currency != requested.currency)
        && (incurred.get() > 0 || reserved.get() > 0 || uncertain)
    {
        return Err(BudgetError::Invalid(ValidationErrors::field(
            "currency",
            "outstanding_accounting",
        )));
    }
    Budget::new(BudgetData {
        revision: Counter::new(current.checked_add(1).ok_or(BudgetError::Conflict)?),
        limit_micros: requested.limit_micros,
        currency: requested.currency.clone(),
        incurred_micros: incurred,
        reserved_micros: reserved,
        uncertain_usage: uncertain,
    })
    .map_err(BudgetError::Invalid)
}
#[cfg(test)]
mod tests {
    use super::*;
    use ironloom_core::ActorId;
    fn budget() -> Budget {
        Budget::new(BudgetData {
            revision: Counter::new(3),
            limit_micros: Some(Counter::new(100)),
            currency: ActorId::new("USD").unwrap(),
            incurred_micros: Counter::new(30),
            reserved_micros: Counter::new(20),
            uncertain_usage: true,
        })
        .unwrap()
    }
    #[test]
    fn edits_preserve_accounting_even_when_disabling_or_lowering_the_limit() {
        let previous = budget();
        for limit in [None, Some(Counter::new(1))] {
            let mut requested = (*previous).clone();
            requested.limit_micros = limit;
            let next = edit(Some(&previous), &Budget::new(requested).unwrap()).unwrap();
            assert_eq!(next.revision.get(), 4);
            assert_eq!(next.incurred_micros.get(), 30);
            assert_eq!(next.reserved_micros.get(), 20);
            assert!(next.uncertain_usage);
        }
    }
    #[test]
    fn human_edits_cannot_reset_accounting_or_convert_its_currency() {
        let previous = budget();
        for field in ["incurred", "reserved", "unknown", "currency"] {
            let mut requested = (*previous).clone();
            match field {
                "incurred" => requested.incurred_micros = Counter::new(0),
                "reserved" => requested.reserved_micros = Counter::new(0),
                "unknown" => requested.uncertain_usage = false,
                _ => requested.currency = ActorId::new("EUR").unwrap(),
            }
            assert!(matches!(
                edit(Some(&previous), &Budget::new(requested).unwrap()),
                Err(BudgetError::Invalid(_))
            ));
        }
    }
    #[test]
    fn first_edit_requires_empty_accounting_and_revisions_never_wrap() {
        let mut initial = (*budget()).clone();
        initial.revision = Counter::new(1);
        assert!(matches!(
            edit(None, &Budget::new(initial.clone()).unwrap()),
            Err(BudgetError::Invalid(_))
        ));
        initial.incurred_micros = Counter::new(0);
        initial.reserved_micros = Counter::new(0);
        initial.uncertain_usage = false;
        assert_eq!(
            edit(None, &Budget::new(initial).unwrap())
                .unwrap()
                .revision
                .get(),
            2
        );
        let mut exhausted = (*budget()).clone();
        exhausted.revision = Counter::new(u64::MAX);
        let exhausted = Budget::new(exhausted).unwrap();
        assert_eq!(
            edit(Some(&exhausted), &exhausted),
            Err(BudgetError::Conflict)
        );
    }
}
