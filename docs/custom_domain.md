# Custom Domain Setup for Cinque

To use the custom subdomain `cinque.mndro.org` instead of the default Firebase Hosting URL, follow these steps:

1. Open the [Firebase Console](https://console.firebase.google.com/).
2. Select your `cinque` project.
3. In the left navigation bar, go to **Build > Hosting**.
4. Click on **Add custom domain**.
5. Enter `cinque.mndro.org` and click **Continue**.
6. Firebase will provide you with DNS verification records (TXT) and A records.
7. Go to your DNS provider for `mndro.org` and add those records.
8. Wait for the SSL certificate to be provisioned (this can take up to 24 hours but usually finishes in a few minutes).

Once verified, deployments via `npm run deploy:production` will automatically be served on `cinque.mndro.org`.
