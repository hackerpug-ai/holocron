---
service: public-reader
feature: UC-READ-06
priority: P0
type: security
tier: holdout
---

# The token path cannot be used to reach anything but a document

Request /d/../api/documents, /d/<valid-token>/../../admin, /d/<valid-token>/assets/../../../etc/passwd, and /d/<valid-token>%2f%2e%2e%2f. None may return anything other than the designed document or withdrawn response, and none may reach an authenticated route. Confirm from the device platform log that none of these produced a database query outside the document scope.
