# Memory BIST in one page

A **memory built-in self-test (MBIST)** writes and reads patterns to a memory on the chip itself and
reports whether every cell works. It runs at speed, needs no external tester, and can be started over
JTAG.

## March tests

| Test | Operations per address | Finds |
|---|---|---|
| MATS+ | ⇕(w0); ⇑(r0,w1); ⇓(r1,w0) | stuck-at faults |
| March C− | ⇕(w0); ⇑(r0,w1); ⇑(r1,w0); ⇓(r0,w1); ⇓(r1,w0); ⇕(r0) | stuck-at, transition, coupling faults |

## What the controller needs

- an **address generator** (up / down),
- a **data generator** (background patterns),
- a **comparator** and a fail log,
- a small **FSM** that steps through the March elements,
- a **test access** path — here an IEEE 1149.1 / 1687 (JTAG) register.

```systemverilog
typedef enum logic [2:0] {IDLE, W0, R0W1, R1W0, DONE} march_t;
```

> Read the project brief for the full plan; this page is only a primer.
