from django.conf.urls.defaults import patterns, url

from reviewboard.offline.manifests import GearsManifestResponse, \
                                          Html5ManifestResponse


urlpatterns = patterns('reviewboard.offline.views',
    # Google Gears
    url(r'^gears/manifest/$', 'manifest',
        {'manifest_class': GearsManifestResponse},
        name="gears-manifest"),

    # HTML 5
    url(r'^html5/manifest/$', 'manifest',
        {'manifest_class': Html5ManifestResponse},
        name="html5-manifest"),
)
