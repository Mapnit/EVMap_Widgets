from __future__ import print_function, unicode_literals, absolute_import
import json
from argparse import Namespace
import arcpy
import sys

#support python 2&3
try:
    from urllib.request import urlopen
    from urllib.parse import urlencode
except ImportError:
    from urllib import urlencode
    from urllib import urlopen

#service endpoint for retrieving ArcGIS Server information
serverInfoUrl = "http://smeridianicses.ihsglobal.local/portaltools/api/servers"

#this folder will get created in the users portal
targetFolder = "IHS Map Services"
exclusionFolders = ["enerdeq", "wms"]

agsMeridianToken = None
agsMeridianTokenUrl = "https://meridianmapservices.ihsenergy.com/administration/generateToken"
agsMeridian = "https://meridianmapservices.ihsenergy.com/wss/service/ags-relay/EMS_2_00/agstoken/arcgis/rest/services"

agsEMSToken = None
agsEMSTokenUrl = "https://mapservices.ihs.com/administration/generateToken"
agsEMS = "https://mapservices.ihs.com/wss/service/ags-relay/EMS_1_00/agstoken/arcgis/rest/services"

#will read all map services from these ags
servers = [[agsMeridianToken, agsMeridianTokenUrl, agsMeridian, "Meridian"],[agsEMSToken, agsEMSTokenUrl, agsEMS, "EMS"]]

def sendRequest(data, url, requesttype='generic request'):

    #server encoding
    encoding = 'utf-8'

    #encode parameters
    parameters = urlencode(data)
    parameters = parameters.encode(encoding)

    #send request
    response = urlopen(url, parameters).read().decode(encoding)

    try:
        #load response to server object
        serverObject = json.loads(response, object_hook=lambda d: Namespace(**d))

        #check for errors
        if hasattr(serverObject, 'error'):
            print(serverObject.error.message)
            for detail in serverObject.error.details:
                print(detail)
            return None
        else:
            return serverObject
    except:
        print('An unspecified error occurred sending the request for {}'.format(requesttype))
        e = sys.exc_info()[1]
        print(e.args[0])
        return None

def getPortalToken(username, password, portalUrl):
    #arcpy.AddMessage("Attempting to get Portal Token with user '{}' and password '{}'".format(username, password))
    '''Retrieves a token to be used with API requests.'''
    requestJson = {'username' : username,
                    'password' : password,
                    'client' : 'referer',
                    'referer': portalUrl,
                    'expiration': 60,
                    'f' : 'json'}

    requestUrl = portalUrl + '/sharing/rest/generateToken?'

    return sendRequest(requestJson, requestUrl, "portal token")

def getPortalUserInfo(portalUrl, portalToken, portalUser):

    requestJson = {'culture' : 'en',
                    'token' : portalToken,
                    'f' : 'json'}

    requestUrl = portalUrl + '/sharing/content/users/{}?'.format(portalUser)

    return sendRequest(requestJson, requestUrl, "portal user info")

def getPortalFolderInfo(portalUrl, portalToken, portalUser, folderUID):

    requestJson = {'culture' : 'en',
                    'token' : portalToken,
                    'f' : 'json'}

    requestUrl = portalUrl + '/sharing/content/users/{}/{}?'.format(portalUser, folderUID)

    return sendRequest(requestJson, requestUrl, "portal folder info")

def getPortalInfo(portalUrl, portalToken):

    requestJson = {'culture' : 'en',
                    'token' : portalToken,
                    'f' : 'json'}

    requestUrl = portalUrl + '/sharing/rest/portals/self?'
    
    return sendRequest(requestJson, requestUrl, "portal info")

def createPortalFolder(portalFolderName, portalUser, portalUrl, portalToken):

    requestJson = {'foldername' : portalFolderName.replace(' ', '_'),
                    'title': portalFolderName,
                    'token' : portalToken,
                    'f' : 'json'}

    requestUrl = portalUrl + '/sharing/content/users/{}/createFolder?'.format(portalUser)

    return sendRequest(requestJson, requestUrl, "create portal folder")

def getAgsToken(tokenUrl, agsUser, agsPassword):
	#arcpy.AddMessage("Attempting to get AGS Token with user '{}' and password '{}'".format(agsUser, agsPassword))
	requestJson = {'request' : 'getToken',
                    'username': agsUser,
                    'password' : agsPassword,
                    'expiration': 60,
                    'f' : 'json'}

	requestUrl = tokenUrl + '?'
	
	return sendRequest(requestJson, requestUrl, "ArcGIS Server token")

def getAgsMapServices(agsToken, agsServicesDirectory):

    requestJson = {'token': agsToken,
                    'f' : 'json'}

    requestUrl = agsServicesDirectory + '?'

    return sendRequest(requestJson, requestUrl, "ArcGIS Server Map Services")

def getAgsServiceInfo(serviceUrl, agsToken):

    requestJson = {'token': agsToken,
                    'f' : 'json'}

    requestUrl = serviceUrl + '?'

    return sendRequest(requestJson, requestUrl, "ArcGIS Server service info")

def createPortalProxy(portalUrl, portalToken, portalUser, folderUID, serviceType, serviceTypeKeywords, serviceUrl, serviceTitle, serviceTags, serviceUser, servicePassword, serviceDescription, serviceSnippet, serviceAccessInformation, serviceSpatialReference, serviceExtent, serviceThumbnailUrl):

    requestJson = {'type' : serviceType,
                    'typeKeywords': serviceTypeKeywords,
                    'url': serviceUrl,
                    'title': serviceTitle,
                    'tags': serviceTags,
                    'serviceUsername': serviceUser,
                    'servicePassword': servicePassword,
                    'description': serviceDescription,
                    'snippet': serviceSnippet,
                    'accessInformation': serviceAccessInformation,
                    'spatialReference': serviceSpatialReference,
                    'extent': serviceExtent,
                    'thumbnailURL': serviceThumbnailUrl,
                    'token' : portalToken,
                    'f' : 'json'}

    requestUrl = portalUrl + '/sharing/content/users/{}/{}/addItem?'.format(portalUser, folderUID)

    return sendRequest(requestJson, requestUrl, "create portal proxy")

def ItemExists(folderInfo, searchItem):
    for item in folderInfo.items:
        if item.title.lower() == searchItem.lower():
            return True

    return False

def ProjectExtent(extent, outSystem):
    sr = arcpy.SpatialReference(extent.spatialReference.wkid)    
    srOut = arcpy.SpatialReference(outSystem)

    ex = arcpy.Extent(extent.xmin, extent.ymin, extent.xmax, extent.ymax)

    xfers = arcpy.ListTransformations(sr, srOut)

    max = ProjectPoint(extent.xmax, extent.ymax, sr, srOut)
    min = ProjectPoint(extent.xmin, extent.ymin, sr, srOut)

    projExtent = "{},{},{},{}".format(min.X, min.Y, max.X, max.Y)

    if "nan" in projExtent:
        projExtent = "-180, -90, 180, 90"

    return projExtent

def ProjectPoint( x, y, sr, srOut):
    point = arcpy.Point(x, y)
    pg = arcpy.PointGeometry(point, sr)
    pp = pg.projectAs(srOut)
    part = pp.getPart()
    return part

def GetServers():
    response = urlopen(serverInfoUrl)
    servers = json.load(response)
    return servers

def CreatePortalProxies(portalUrl, portalUser, portalPassword, ihsUser, ihsPassword):

    #servers = GetServers()

    if '*' in portalPassword:
        portalPassword = arcpy.GetParameterAsText(2)

    if '*' in ihsPassword:
        ihsPassword = arcpy.GetParameterAsText(4)

    #get portal token and other info
    portalToken = getPortalToken(portalUser, portalPassword, portalUrl)

    if not portalToken:
        arcpy.AddError("Portal Account Invalid")
        return

    userInfo = getPortalUserInfo(portalUrl, portalToken.token, portalUser)

    if not userInfo:
        arcpy.AddError("Portal User Information Could Not Be Retrieved")
        return

    userPortal = getPortalInfo(portalUrl, portalToken.token)

    if not userPortal:
        arcpy.AddError("Portal Information Could Not Be Retrieved")
        return

    #validate accounts
    ihsAccountsValid = True
    for server in servers:
        #query ags server token
        agsToken = getAgsToken(server[1], ihsUser, ihsPassword)

        if not agsToken:
            arcpy.AddError("IHS Account Invalid ({})".format(server[3]))
            ihsAccountsValid = False
        else:
            server[0] = agsToken

    if not ihsAccountsValid:
        return

    #create portal folder if needed
    targetUserFolder = "{} ({})".format(targetFolder, ihsUser)
    folderUID = ""
    for folderItem in userInfo.folders:

        if folderItem.title == targetUserFolder:
            folderUID = folderItem.id
            break #folder found

    #folder not found create it
    if folderUID == "":
        folder = createPortalFolder(targetUserFolder, portalUser, portalUrl, portalToken.token)
        if folder:
            folderUID =  folder.folder.id
        else:
            print("Portal Folder Could Not Be Created")
            return

    #get the portal folder information
    portalFolderInfo = getPortalFolderInfo(portalUrl, portalToken.token, portalUser, folderUID)

    for server in servers:

        #get the token object for the ags instance
        agsToken = server[0]

        #query ags server info
        serverInfo = getAgsMapServices(agsToken.token, server[2])

        #map services in source ags server
        mapServices = []

        if serverInfo:

            #search folders
            for serverFolder in serverInfo.folders:
                if serverFolder.lower() not in exclusionFolders:
                    folderInfo = getAgsMapServices(agsToken.token, "{}/{}".format(server[2], serverFolder))
                    if folderInfo:
                        for serviceInfo in folderInfo.services:
                            if serviceInfo.type == "MapServer":
                                mapServices.append(["{}/{}".format(server[2], serviceInfo.name), serverFolder, server[3]])
                    else:
                        arcpy.AddWarning("Folder: {} Could Not Be Read".format(serverFolder))

            #search root
            for serviceInfo in serverInfo.services:
                if serviceInfo.type == "MapServer":
                    mapServices.append(["{}/{}".format(server[2], serviceInfo.name), "Root", server[3]])


        for mapService in mapServices:

            serviceUrl = "{}/MapServer".format(mapService[0])
            serviceJson = getAgsServiceInfo(serviceUrl, agsToken.token)

            #create the service title for the proxy
            serviceTitle = "{} -- {} -- {}".format(mapService[2], mapService[1], serviceJson.mapName)

            #if the proxy doesn't exist
            if not ItemExists(portalFolderInfo, serviceTitle):

                #set the proxy information
                serviceType = 'Map Service'
                serviceTypeKeywords = serviceJson.capabilities
                serviceTags = serviceJson.documentInfo.Keywords
                serviceDescription = serviceJson.description
                serviceSnippet = serviceJson.description
                serviceAccessInformation = serviceJson.copyrightText.encode('ascii',errors='ignore')
                #serviceAccessInformation = u"\N{COPYRIGHT SIGN}" + unicode(serviceAccessInformation)
                serviceSpatialReference = serviceJson.initialExtent.spatialReference.wkid

                serviceExtent = ProjectExtent(serviceJson.fullExtent, "WGS 1984")

                #create the proxy thumbnail url
                imageType = serviceJson.supportedImageFormatTypes.split(",")[0]
                imageExtent = "{},{},{},{}".format(serviceJson.fullExtent.xmin,serviceJson.fullExtent.ymin,serviceJson.fullExtent.xmax,serviceJson.fullExtent.ymax)
                serviceThumbnailUrl = "{}/export?size=200,133&f=image&bbox={}&format={}&token={}".format(serviceUrl, imageExtent, imageType, agsToken.token)

                #create the proxy in the IHS proxy folder
                mapProxy = createPortalProxy(portalUrl, portalToken.token, portalUser, folderUID, serviceType, serviceTypeKeywords, serviceUrl, serviceTitle, serviceTags, ihsUser, ihsPassword, serviceDescription, serviceSnippet, serviceAccessInformation, serviceSpatialReference, serviceExtent, serviceThumbnailUrl)
                
                proxyCreated = False
                if mapProxy:
                    if bool(mapProxy.success):
                        proxyCreated = True

                if proxyCreated:
                    arcpy.AddMessage("Proxy Created Successfully: {}:{}".format(serviceTitle, mapProxy.id))
                else:
                    arcpy.AddWarning("Proxy Not Created For: {}".format(mapService))
                    
            else:
                arcpy.AddMessage("Proxy Exists: {}".format(serviceTitle))

if __name__ == "__main__":
    #so we can run from command line
    argCount = len(sys.argv)
    #arcpy.AddMessage(argCount)

    args = tuple(sys.argv[1:argCount]) #strip script name

    #arcpy.AddMessage(args)
    CreatePortalProxies(*args)

