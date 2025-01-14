import { map, shareReplay, switchMap, tap } from 'rxjs/operators'
import { HttpClient } from '@angular/common/http'
import { Inject, Injectable, LOCALE_ID } from '@angular/core'
import { peertubeLocalStorage } from '@app/shared/misc/peertube-local-storage'
import { Observable, of, ReplaySubject } from 'rxjs'
import { getCompleteLocale, ServerConfig } from '../../../../../shared'
import { environment } from '../../../environments/environment'
import { VideoConstant, VideoPrivacy } from '../../../../../shared/models/videos'
import { isDefaultLocale, peertubeTranslate } from '../../../../../shared/models/i18n'
import { getDevLocale, isOnDevLocale } from '@app/shared/i18n/i18n-utils'
import { sortBy } from '@app/shared/misc/utils'
import { VideoPlaylistPrivacy } from '@shared/models/videos/playlist/video-playlist-privacy.model'
import { cloneDeep } from 'lodash-es'

@Injectable()
export class ServerService {
  private static BASE_SERVER_URL = environment.apiUrl + '/api/v1/server/'
  private static BASE_CONFIG_URL = environment.apiUrl + '/api/v1/config/'
  private static BASE_VIDEO_URL = environment.apiUrl + '/api/v1/videos/'
  private static BASE_VIDEO_PLAYLIST_URL = environment.apiUrl + '/api/v1/video-playlists/'
  private static BASE_LOCALE_URL = environment.apiUrl + '/client/locales/'
  private static CONFIG_LOCAL_STORAGE_KEY = 'server-config'

  configLoaded = new ReplaySubject<boolean>(1)
  videoPrivaciesLoaded = new ReplaySubject<boolean>(1)
  videoPlaylistPrivaciesLoaded = new ReplaySubject<boolean>(1)
  videoCategoriesLoaded = new ReplaySubject<boolean>(1)
  videoLicencesLoaded = new ReplaySubject<boolean>(1)
  videoLanguagesLoaded = new ReplaySubject<boolean>(1)
  localeObservable: Observable<any>

  private config: ServerConfig = {
    instance: {
      name: 'PeerTube',
      shortDescription: 'PeerTube, a federated (ActivityPub) video streaming platform  ' +
                        'using P2P (BitTorrent) directly in the web browser with WebTorrent and Angular.',
      defaultClientRoute: '',
      isNSFW: false,
      defaultNSFWPolicy: 'do_not_list' as 'do_not_list',
      customizations: {
        javascript: '',
        css: ''
      }
    },
    plugin: {
      registered: []
    },
    theme: {
      registered: [],
      default: 'default'
    },
    email: {
      enabled: false
    },
    contactForm: {
      enabled: false
    },
    serverVersion: 'Unknown',
    signup: {
      allowed: false,
      allowedForCurrentIP: false,
      requiresEmailVerification: false
    },
    transcoding: {
      enabledResolutions: [],
      hls: {
        enabled: false
      },
      webtorrent: {
        enabled: true
      }
    },
    avatar: {
      file: {
        size: { max: 0 },
        extensions: []
      }
    },
    video: {
      image: {
        size: { max: 0 },
        extensions: []
      },
      file: {
        extensions: []
      }
    },
    videoCaption: {
      file: {
        size: { max: 0 },
        extensions: []
      }
    },
    user: {
      videoQuota: -1,
      videoQuotaDaily: -1
    },
    import: {
      videos: {
        http: {
          enabled: false
        },
        torrent: {
          enabled: false
        }
      }
    },
    trending: {
      videos: {
        intervalDays: 0
      }
    },
    autoBlacklist: {
      videos: {
        ofUsers: {
          enabled: false
        }
      }
    },
    tracker: {
      enabled: true
    }
  }
  private videoCategories: Array<VideoConstant<number>> = []
  private videoLicences: Array<VideoConstant<number>> = []
  private videoLanguages: Array<VideoConstant<string>> = []
  private videoPrivacies: Array<VideoConstant<VideoPrivacy>> = []
  private videoPlaylistPrivacies: Array<VideoConstant<VideoPlaylistPrivacy>> = []

  constructor (
    private http: HttpClient,
    @Inject(LOCALE_ID) private localeId: string
  ) {
    this.loadServerLocale()
    this.loadConfigLocally()
  }

  loadConfig () {
    this.http.get<ServerConfig>(ServerService.BASE_CONFIG_URL)
        .pipe(tap(this.saveConfigLocally))
        .subscribe(data => {
          this.config = data

          this.configLoaded.next(true)
        })
  }

  loadVideoCategories () {
    return this.loadAttributeEnum(ServerService.BASE_VIDEO_URL, 'categories', this.videoCategories, this.videoCategoriesLoaded, true)
  }

  loadVideoLicences () {
    return this.loadAttributeEnum(ServerService.BASE_VIDEO_URL, 'licences', this.videoLicences, this.videoLicencesLoaded)
  }

  loadVideoLanguages () {
    return this.loadAttributeEnum(ServerService.BASE_VIDEO_URL, 'languages', this.videoLanguages, this.videoLanguagesLoaded, true)
  }

  loadVideoPrivacies () {
    return this.loadAttributeEnum(ServerService.BASE_VIDEO_URL, 'privacies', this.videoPrivacies, this.videoPrivaciesLoaded)
  }

  loadVideoPlaylistPrivacies () {
    return this.loadAttributeEnum(
      ServerService.BASE_VIDEO_PLAYLIST_URL,
      'privacies',
      this.videoPlaylistPrivacies,
      this.videoPlaylistPrivaciesLoaded
    )
  }

  getConfig () {
    return cloneDeep(this.config)
  }

  getVideoCategories () {
    return cloneDeep(this.videoCategories)
  }

  getVideoLicences () {
    return cloneDeep(this.videoLicences)
  }

  getVideoLanguages () {
    return cloneDeep(this.videoLanguages)
  }

  getVideoPrivacies () {
    return cloneDeep(this.videoPrivacies)
  }

  getVideoPlaylistPrivacies () {
    return cloneDeep(this.videoPlaylistPrivacies)
  }

  private loadAttributeEnum (
    baseUrl: string,
    attributeName: 'categories' | 'licences' | 'languages' | 'privacies',
    hashToPopulate: VideoConstant<string | number>[],
    notifier: ReplaySubject<boolean>,
    sort = false
  ) {
    this.localeObservable
        .pipe(
          switchMap(translations => {
            return this.http.get<{ [id: string]: string }>(baseUrl + attributeName)
                       .pipe(map(data => ({ data, translations })))
          })
        )
        .subscribe(({ data, translations }) => {
          Object.keys(data)
                .forEach(dataKey => {
                  const label = data[ dataKey ]

                  hashToPopulate.push({
                    id: attributeName === 'languages' ? dataKey : parseInt(dataKey, 10),
                    label: peertubeTranslate(label, translations)
                  })
                })

          if (sort === true) sortBy(hashToPopulate, 'label')

          notifier.next(true)
        })
  }

  private loadServerLocale () {
    const completeLocale = isOnDevLocale() ? getDevLocale() : getCompleteLocale(this.localeId)

    // Default locale, nothing to translate
    if (isDefaultLocale(completeLocale)) {
      this.localeObservable = of({}).pipe(shareReplay())
      return
    }

    this.localeObservable = this.http
                                  .get(ServerService.BASE_LOCALE_URL + completeLocale + '/server.json')
                                  .pipe(shareReplay())
  }

  private saveConfigLocally (config: ServerConfig) {
    peertubeLocalStorage.setItem(ServerService.CONFIG_LOCAL_STORAGE_KEY, JSON.stringify(config))
  }

  private loadConfigLocally () {
    const configString = peertubeLocalStorage.getItem(ServerService.CONFIG_LOCAL_STORAGE_KEY)

    if (configString) {
      try {
        const parsed = JSON.parse(configString)
        Object.assign(this.config, parsed)
      } catch (err) {
        console.error('Cannot parse config saved in local storage.', err)
      }
    }
  }
}
