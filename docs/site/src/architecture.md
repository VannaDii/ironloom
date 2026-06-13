# Architecture

Ironloom routes work through a typed process graph. The supervisor validates policy, selects a worker, records immutable artifacts under `.ironloom`, and reports outcomes back to the originating control surface.

Adapters for Discord, GitHub, and SonarCloud stay at the edges. Business rules live in core crates, policy, the process graph, workers, and the supervisor.
