# Story

```mermaid
sequenceDiagram
    participant W as Web App
    participant P as Payments
    %% @chapter "Place order"
    W->>P: Confirm
    %% @pause
    W->>+P: Authorise card
    %% @pasue 1s
    P-->>-W: Done
    alt valid
        P->>W: ok
    else invalid
        P->>W: no
    end
```
