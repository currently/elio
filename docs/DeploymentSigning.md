# Deployment Signing
Deployments to Elio are encrypted, authenticated and signed. Majority of this process happens fairly quickly but the setup can be complicated. Elio utilizes HMAC as a primary way for authorization of publishing source while it also requires asymmetric encryption whereby the public key is available for decryption to Elio.

## Deployment immutability
All deployments are immutable. 

## Message authentication
HMAC is used to authenticate all deployments,