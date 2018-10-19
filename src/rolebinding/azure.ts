import { AuthenticationContext, TokenResponse } from 'adal-node';
import parentLogger from '../logger';
import { creds } from '../util/config';
const MicrosoftGraph = require("@microsoft/microsoft-graph-client"); // Import without types because they're bugged.

const logger = parentLogger.child({ module: 'azure' });

interface Group { fields: { GruppeID: string } }
export async function getRegisteredTeamsFromSharepoint() {
    const response = await get('/groups/9f0d0ea1-0226-4aa9-9bf9-b6e75816fabf/sites/root/lists/nytt team/items?expand=fields').catch(error => {
        logger.warn("failed to get groups from Microsoft Graph Api, error was:", error)
        return false;
    });

    if (!response) {
        return
    }

    return new Promise<{ [key: string]: string }>(async (resolve, reject) => {
        const groupPromises = response.value
            .filter((group: Group) => group.fields.hasOwnProperty('GruppeID'))
            .map(async (group: Group) => {return await groupIdWithMail(group.fields.GruppeID)});

        // This step is necessary to rearrage the data into a more useful format for later use.
        Promise.all(groupPromises).then((groupList: any) => {
            const groups: { [key: string]: string } = {}
            for (var group of groupList) {
                groups[group.team] = group.id
            }

            logger.debug("groups found:", groups);
            resolve(groups)
        }).catch(reject)
    });
}

async function groupIdWithMail(groupId: string) {
    return new Promise<{id: string, team: string}>((resolve, reject) => {
        get(`/groups/${groupId}`).
            then((response) => {
                const mail = response.mail.toLowerCase();
                const team = mail.substring(0, mail.indexOf("@"));
                resolve({id: groupId, team: team});
            }).catch(reject);
    });
}

const authorityUrl = 'https://login.windows.net' + '/' + creds.tenantId;
const resource = 'https://graph.microsoft.com';
var context = new AuthenticationContext(authorityUrl);

function get(url: string) {
    return new Promise<any>((resolve, reject) => {
        context.acquireTokenWithClientCredentials(
            resource,
            creds.appId,
            creds.clientSecret,
            function (err: Error, tokenResponse: TokenResponse) {
                if (err) {
                    logger.warn('unable to auth with azur: ' + err.stack);
                } else {
                    const client = MicrosoftGraph.Client.init({
                        defaultVersion: 'v1.0',
                        authProvider: (done: any) => {
                            done(null, tokenResponse.accessToken)
                        }
                    })
                    client
                        .api(url)
                        .get()
                        .then(resolve)
                        .catch(reject)
                }
            }
        );
    })
}