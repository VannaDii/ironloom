import {
  createDefaultArtifactRegistry,
  createArtifactRegistry,
  describeArtifactRegistry,
  recordArtifactMigration,
  registerArtifactType,
} from './logic.js';
import type {
  ArtifactMigrationRecord,
  ArtifactRegistry,
  ArtifactRegistryEntry,
} from './codec.js';

export class ArtifactRegistryService {
  public createDefault(repositoryKey: string): ArtifactRegistry {
    return createDefaultArtifactRegistry(repositoryKey);
  }

  public execute(input: ArtifactRegistry): ArtifactRegistry {
    return createArtifactRegistry(input);
  }

  public register(
    registry: ArtifactRegistry,
    entry: ArtifactRegistryEntry,
  ): ArtifactRegistry {
    return registerArtifactType(registry, entry);
  }

  public recordMigration(
    registry: ArtifactRegistry,
    migration: ArtifactMigrationRecord,
  ): ArtifactRegistry {
    return recordArtifactMigration(registry, migration);
  }

  public explain(input: ArtifactRegistry): string {
    return describeArtifactRegistry(input);
  }
}
