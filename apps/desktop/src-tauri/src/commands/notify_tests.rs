use super::authorize_notice;
#[test]
fn suppressed_notifications_fail_closed() {
    assert!(authorize_notice("errors", true, true).is_err());
    assert!(authorize_notice("errors", false, false).is_err());
    assert!(authorize_notice("other", false, true).is_err());
    assert!(authorize_notice("taskCompletion", false, true).is_ok());
    assert!(authorize_notice("approvalRequests", false, true).is_ok());
}
