# Principles

Why these rules exist, in the order they tend to matter.

## Blast radius first

The worst administration mistakes are not subtle bugs. They are correct code run against the wrong set: a filter that matched everyone, a list with a blank row, a wildcard that expanded further than expected. The rules push the set to be small, named and reviewed before anything changes.

- Prefer an input file of named accounts or devices over a query.
- If a query is unavoidable, print the count and the first few rows, and stop if the count is above a limit.
- A change that cannot be undone (wipe, delete, retire) is never run over a query result.

## Dry run is the default, not a feature

`-WhatIf` is only useful if people use it. Make the safe path the one that happens when nobody passes a flag: the script plans, shows the plan and exits. Making a change takes an explicit `-Apply`.

## Secrets do not belong in text

A secret in a script ends up in version control, in a ticket, in a transcript or in an agent's context. Use an interactive sign-in for a person, a certificate or managed identity for automation, and a vault for anything else. Logs record what happened to an object, not the credential that did it.

## Least privilege is a design choice

A script that reads should not be able to write. Choose `Read` scopes for reports. For changes, choose the narrowest scope that covers the call, and say in the script's help why each scope is there. Check the Microsoft Graph permissions reference for the least-privileged permission for each call, because it changes over time.

## A person approves the dangerous things

Some actions are rarely routine: granting a privileged role, forwarding mail outside the organisation, removing an authentication method, switching a protection off, wiping a device. An agent can draft the script and show the dry run. A named person approves running it. The checker treats these as errors so the conversation happens.

## Leave evidence

After a change, someone will ask what happened to a given account. A CSV with the object, the action, the result and the time answers that. It also makes a half-finished run visible instead of silent.
