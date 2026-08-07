# RH-S30-22 branch oracle map

| inject | independent identity | durable ledger | refuse |
|--------|---------------------|----------------|--------|
| non_201_accepted_id | injected documentId | accepted_writes.id contains id | POST_EXPORT_WRITE_ACCEPTED \| POST_PONR_INELIGIBLE |
| transport_error | inject documentId | accepted_writes.id contains id | same |
| reselect_miss | fetch interceptor captures HTTP 201 document.id; DB documents cross-check | ledger id == independentHttp201Id; not reselect probe id | same |

Suite: `suite-vitest.log` (6/6 green).
