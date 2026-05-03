import {
  createDefaultArtifactRegistry,
  createArtifactRegistry,
  describeArtifactRegistry,
  findArtifactMigrationPath,
  recordArtifactMigration,
  registerArtifactType,
} from './logic.js';
import type {
  ArtifactMigrationRecord,
  ArtifactRegistry,
  ArtifactRegistryEntry,
} from './codec.js';

/** Service shell for repository-scoped artifact registry operations. */
export class ArtifactRegistryService {
  /** Creates the deterministic default lifecycle artifact registry. */
  public createDefault(repositoryKey: string): ArtifactRegistry {
    return createDefaultArtifactRegistry(repositoryKey);
  }

  /** Normalizes a repository-scoped artifact registry. */
  public execute(input: ArtifactRegistry): ArtifactRegistry {
    return createArtifactRegistry(input);
  }

  /** Registers or replaces the current entry for an artifact type. */
  public register(
    registry: ArtifactRegistry,
    entry: ArtifactRegistryEntry,
  ): ArtifactRegistry {
    return registerArtifactType(registry, entry);
  }

  /** Records a migration event in the registry. */
  public recordMigration(
    registry: ArtifactRegistry,
    migration: ArtifactMigrationRecord,
  ): ArtifactRegistry {
    return recordArtifactMigration(registry, migration);
  }

  /** Finds the ordered migration path between artifact versions. */
  public findMigrationPath(
    registry: ArtifactRegistry,
    artifactType: ArtifactRegistryEntry['artifactType'],
    fromVersion: number,
    toVersion: number,
  ): ArtifactMigrationRecord[] {
    return findArtifactMigrationPath(
      registry,
      artifactType,
      fromVersion,
      toVersion,
    );
  }

  /** Describes registry coverage for operator status output. */
  public explain(input: ArtifactRegistry): string {
    return describeArtifactRegistry(input);
  }
}
