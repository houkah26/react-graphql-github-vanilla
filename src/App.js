import React, { Component } from "react";
import axios from "axios";

const TITLE = "REACT GraphQL GitHub Client";

const axiosGitHubGraphQL = axios.create({
  baseURL: "https://api.github.com/graphql",
  headers: {
    Authorization: `bearer ${
      process.env.REACT_APP_GITHUB_PERSONAL_ACCESS_TOKEN
    }`
  }
});

const GET_ISSUES_OF_REPOSITORY = `
  query (
    $organization: String!,
    $repository: String!,
    $cursor: String
  ) {
    organization(login: $organization) {
      name
      url
      repository(name: $repository) {
        id
        viewerHasStarred
        stargazers {
          totalCount
        }
        name
        url
        issues(first: 5, after: $cursor, states: [OPEN, CLOSED]) {
          pageInfo {
            endCursor
            hasNextPage
          }
          edges {
            node {
              id
              title
              url
              reactions(last: 5) {
                edges {
                  node {
                    id
                    content
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

const ADD_STAR = `
  mutation ($repositoryId: ID!) {
    addStar(input: {starrableId:$repositoryId}) {
      starrable {
        viewerHasStarred
      }
    }
  }
`;

const REMOVE_STAR = `
  mutation ($repositoryId: ID!) {
    removeStar(input: {starrableId:$repositoryId}) {
      starrable {
        viewerHasStarred
      }
    }
  }
`;

const ADD_REACTION = `
  mutation ($issueId: ID!, $reaction: ReactionContent!) {
    addReaction(input: {subjectId: $issueId, content: $reaction}) {
      subject {
        reactions(last: 3) {
          edges {
            node {
              id
              content
            }
          }
        } 
      }
    }
  }
`;

const resolveIssuesQuery = (queryResult, cursor) => state => {
  const { data, errors } = queryResult.data;

  if (!cursor) {
    return {
      organization: data.organization,
      errors
    };
  }

  const { edges: oldIssues } = state.organization.repository.issues;
  const { edges: newIssues } = data.organization.repository.issues;
  const updatedIssues = [...oldIssues, ...newIssues];

  return {
    organization: {
      ...data.organization,
      repository: {
        ...data.organization.repository,
        issues: {
          ...data.organization.repository.issues,
          edges: updatedIssues
        }
      }
    },
    errors
  };
};

const resolveStarMutation = viewerHasStarred => ({ organization }) => ({
  organization: {
    ...organization,
    repository: {
      ...organization.repository,
      viewerHasStarred,
      stargazers: {
        ...organization.repository.stargazers,
        totalCount:
          organization.repository.stargazers.totalCount +
          (viewerHasStarred ? 1 : -1)
      }
    }
  }
});

const resolveAddReaction = (issueId, reactions) => ({ organization }) => ({
  organization: {
    ...organization,
    repository: {
      ...organization.repository,
      issues: {
        ...organization.repository.issues,
        edges: organization.repository.issues.edges.map(edge =>
          edge.node.id === issueId
            ? {
                ...edge,
                node: {
                  ...edge.node,
                  reactions
                }
              }
            : edge
        )
      }
    }
  }
});

class App extends Component {
  state = {
    path: "the-road-to-learn-react/the-road-to-learn-react",
    organization: null,
    errors: null
  };

  handlePathChange = e => {
    this.setState({ path: e.target.value });
  };

  handleSubmit = e => {
    e.preventDefault();

    this.handleFetch();
  };

  handleStarClick = async (repositoryId, viewerHasStarred) => {
    try {
      const result = await axiosGitHubGraphQL.post("", {
        query: viewerHasStarred ? REMOVE_STAR : ADD_STAR,
        variables: { repositoryId }
      });

      // const {viewerHasStarred} = result.data.add

      this.setState(resolveStarMutation(!viewerHasStarred));
      console.log(result);
    } catch (error) {
      console.error(error);
    }
  };

  handleAddReaction = async (issueId, reaction = "THUMBS_UP") => {
    try {
      const result = await axiosGitHubGraphQL.post("", {
        query: ADD_REACTION,
        variables: { issueId, reaction }
      });

      const { reactions } = result.data.data.addReaction.subject;

      this.setState(resolveAddReaction(issueId, reactions));
    } catch (error) {
      console.error(error);
    }
  };

  fetchMoreIssues = async cursor => {
    this.handleFetch(cursor);
  };

  handleFetch = async cursor => {
    const [organization, repository] = this.state.path.split("/");

    try {
      const result = await axiosGitHubGraphQL.post("", {
        query: GET_ISSUES_OF_REPOSITORY,
        variables: { organization, repository, cursor }
      });

      this.setState(resolveIssuesQuery(result, cursor));
      console.log(result);
    } catch (error) {
      console.error(error);
    }
  };

  componentDidMount() {
    this.handleFetch();
  }

  render() {
    const { state } = this;
    const { path, organization, errors } = state;

    return (
      <div style={{ marginLeft: 30 }}>
        <h1>{TITLE}</h1>

        <form>
          <label htmlFor="url">
            Show open issues for http://github.com/
            <input
              id="url"
              type="text"
              value={path}
              onChange={this.handlePathChange}
              style={{ width: "300px" }}
            />
          </label>
          <button type="submit">Search</button>
        </form>

        <hr />

        {organization || errors ? (
          <Organization
            organization={organization}
            errors={errors}
            onFetchMoreIssues={this.fetchMoreIssues}
            onStarClick={this.handleStarClick}
            onAddReaction={this.handleAddReaction}
          />
        ) : (
          <p>No information yet...</p>
        )}
      </div>
    );
  }
}

const Organization = ({
  organization,
  errors,
  onFetchMoreIssues,
  onStarClick,
  onAddReaction
}) => {
  if (errors) {
    return (
      <p>
        <strong>Something went wrong:</strong>
        {errors.map(error => error.message).join(" ")}
      </p>
    );
  }

  return (
    <div>
      <p>
        <strong>Issues from Organization:</strong>
        <a href={organization.url}>{organization.name}</a>
      </p>

      <Repository
        repository={organization.repository}
        onFetchMoreIssues={onFetchMoreIssues}
        onStarClick={onStarClick}
        onAddReaction={onAddReaction}
      />
    </div>
  );
};

const Repository = ({
  repository,
  onFetchMoreIssues,
  onStarClick,
  onAddReaction
}) => (
  <div>
    <p style={{ display: "inline-block" }}>
      <strong>In Repository:</strong>
      <a href={repository.url}>{repository.name}</a>
    </p>

    <span
      style={{
        paddingLeft: "0.5em",
        color: "#ff9800",
        fontSize: "1.25em",
        cursor: "pointer"
      }}
      onClick={() => onStarClick(repository.id, repository.viewerHasStarred)}
    >
      {repository.viewerHasStarred ? (
        <span>&#9733;</span>
      ) : (
        <span>&#9734;</span>
      )}{" "}
      {repository.stargazers.totalCount}
    </span>

    <ul>
      {repository.issues.edges.map(issue => (
        <Issue
          key={issue.node.id}
          issue={issue}
          onAddReaction={onAddReaction}
        />
      ))}
    </ul>

    <hr />

    {repository.issues.pageInfo.hasNextPage && (
      <button
        onClick={() => onFetchMoreIssues(repository.issues.pageInfo.endCursor)}
      >
        More
      </button>
    )}
  </div>
);

const Issue = ({ issue, onAddReaction }) => (
  <li>
    <a href={issue.node.url}>{issue.node.title}</a>
    <button
      onClick={() => onAddReaction(issue.node.id)}
      style={{ marginLeft: "0.5em" }}
    >
      Add Reaction
    </button>
    <ul>
      {issue.node.reactions.edges.map(reaction => (
        <li key={reaction.node.id}>{reaction.node.content}</li>
      ))}
    </ul>
  </li>
);

export default App;
