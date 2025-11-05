/**
 * ResourceExplorer Component
 * Displays AWS resources with console deep links
 */

import { ExternalLink, Database, Server, Cloud, Boxes, Globe } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './Card';

interface Resource {
  type: 'Lambda' | 'S3' | 'DynamoDB' | 'CloudFront' | 'API' | 'Other';
  name: string;
  arn?: string;
  region?: string;
  consoleUrl?: string;
  status?: 'active' | 'inactive' | 'unknown';
}

interface ResourceExplorerProps {
  resources?: Resource[];
}

export function ResourceExplorer({ resources = [] }: ResourceExplorerProps) {
  // Get icon for resource type
  const getResourceIcon = (type: Resource['type']) => {
    switch (type) {
      case 'Lambda':
        return <Server className="h-5 w-5" />;
      case 'S3':
        return <Database className="h-5 w-5" />;
      case 'DynamoDB':
        return <Boxes className="h-5 w-5" />;
      case 'CloudFront':
        return <Globe className="h-5 w-5" />;
      case 'API':
        return <Cloud className="h-5 w-5" />;
      default:
        return <Cloud className="h-5 w-5" />;
    }
  };

  // Get color for resource type
  const getResourceColor = (type: Resource['type']) => {
    switch (type) {
      case 'Lambda':
        return 'text-orange-500 bg-orange-500/10';
      case 'S3':
        return 'text-green-500 bg-green-500/10';
      case 'DynamoDB':
        return 'text-blue-500 bg-blue-500/10';
      case 'CloudFront':
        return 'text-purple-500 bg-purple-500/10';
      case 'API':
        return 'text-cyan-500 bg-cyan-500/10';
      default:
        return 'text-gray-500 bg-gray-500/10';
    }
  };

  // Get status badge
  const getStatusBadge = (status?: Resource['status']) => {
    if (!status) return null;

    const statusColors = {
      active: 'bg-green-500/10 text-green-500',
      inactive: 'bg-gray-500/10 text-gray-500',
      unknown: 'bg-yellow-500/10 text-yellow-500',
    };

    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[status]}`}>
        {status}
      </span>
    );
  };

  // Group resources by type
  const groupedResources = resources.reduce((groups, resource) => {
    const type = resource.type;
    if (!groups[type]) {
      groups[type] = [];
    }
    groups[type].push(resource);
    return groups;
  }, {} as Record<string, Resource[]>);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Resource Explorer</CardTitle>
        <CardDescription>
          AWS resources with console deep links (Coming in Phase 2.1)
        </CardDescription>
      </CardHeader>

      <CardContent>
        {resources.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <Cloud className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p className="font-medium">No resources detected yet</p>
            <p className="text-sm mt-1">
              Resources will appear here automatically during deployment
            </p>
          </div>
        )}

        {resources.length > 0 && (
          <div className="space-y-4">
            {Object.entries(groupedResources).map(([type, typeResources]) => (
              <div key={type}>
                <h4 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center space-x-2">
                  <span>{getResourceIcon(type as Resource['type'])}</span>
                  <span>
                    {type} ({typeResources.length})
                  </span>
                </h4>

                <div className="space-y-2">
                  {typeResources.map((resource, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-muted/50 transition-colors group"
                    >
                      <div className="flex items-center space-x-3 flex-1 min-w-0">
                        <div
                          className={`p-2 rounded-lg ${getResourceColor(resource.type)}`}
                        >
                          {getResourceIcon(resource.type)}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2">
                            <p className="text-sm font-medium text-foreground truncate">
                              {resource.name}
                            </p>
                            {getStatusBadge(resource.status)}
                          </div>

                          {resource.region && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Region: {resource.region}
                            </p>
                          )}

                          {resource.arn && (
                            <p className="text-xs text-muted-foreground font-mono mt-0.5 truncate">
                              {resource.arn}
                            </p>
                          )}
                        </div>
                      </div>

                      {resource.consoleUrl && (
                        <a
                          href={resource.consoleUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center space-x-1 px-3 py-1.5 text-sm text-primary hover:text-primary-foreground hover:bg-primary rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span>Open in AWS</span>
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Coming soon notice */}
        <div className="mt-6 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
          <h4 className="text-sm font-semibold text-blue-500 mb-1">
            🚀 Enhanced Resource Discovery Coming Soon
          </h4>
          <p className="text-xs text-muted-foreground">
            Automatic resource detection from SST output, health checks, cost tracking, and
            CloudFront cache management are coming in Phase 2.1.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
